from datetime import datetime, time, timedelta, timezone
from decimal import Decimal
from uuid import uuid4

from flask import Blueprint, g, jsonify, request
from psycopg.types.json import Jsonb

from . import validation as v
from .auth import protected
from .cart import fingerprint, get_cart
from .catalog import page_info
from .db import execute, get_db, lock_customer, one, rows
from .errors import ApiError, invalid, missing

bp = Blueprint("orders", __name__, url_prefix="/api")
TRANSITIONS = {
    "pending": ["confirmed", "preparing", "shipped", "cancelled", "refunded"],
    "confirmed": ["preparing", "shipped", "cancelled", "refunded"],
    "preparing": ["shipped", "delivered", "cancelled", "refunded"],
    "shipped": ["delivered", "cancelled", "refunded"],
    "delivered": ["refunded"],
    "cancelled": ["refunded"],
    "refunded": [],
}
COURIER_PREFIXES = {
    "j&t": "JNT",
    "jnt": "JNT",
    "lbc": "LBC",
    "flash": "FLS",
    "ninja": "NJV",
    "grab": "GRB",
}
ORDER_SELECT = """SELECT o.*, u.id AS customer_id, u.name AS customer_name, u.email AS customer_email,
                  COALESCE((SELECT SUM(quantity) FROM order_items WHERE order_id = o.id), 0) AS item_count,
                  preview.product_id AS preview_product_id,
                  preview.product_name AS preview_product_name,
                  preview.image_url AS preview_image_url,
                  preview.category_slug AS preview_category_slug
                  FROM orders o
                  JOIN users u ON u.id = o.user_id
                  LEFT JOIN LATERAL (
                      SELECT oi.product_id, oi.product_name, p.image_url, c.slug AS category_slug
                      FROM order_items oi
                      LEFT JOIN products p ON p.id = oi.product_id
                      LEFT JOIN categories c ON c.id = p.category_id
                      WHERE oi.order_id = o.id
                      ORDER BY oi.created_at ASC, oi.id ASC
                      LIMIT 1
                  ) preview ON TRUE"""


def tracking_prefix(courier_name):
    lowered = (courier_name or "").lower()
    for key, prefix in COURIER_PREFIXES.items():
        if key in lowered:
            return prefix
    letters = "".join(ch for ch in (courier_name or "").upper() if ch.isalpha())
    return (letters[:3] or "TRK").ljust(3, "X")


def default_status_note(status, courier_name=None, tracking_number=None, estimated_delivery=None):
    if status == "confirmed":
        if courier_name and estimated_delivery:
            return f"Your order is confirmed and scheduled with {courier_name}. Estimated arrival: {estimated_delivery}."
        return "Your order has been confirmed by Floréa Haven and is queued for preparation."
    if status == "preparing":
        if courier_name and estimated_delivery:
            tracking_info = f" (Tracking: {tracking_number})" if tracking_number else ""
            return f"Your order is being processed for dispatch via {courier_name}{tracking_info}. Estimated arrival: {estimated_delivery}."
        return "Our florists are carefully preparing and packaging your order."
    if status == "shipped":
        if courier_name and estimated_delivery:
            tracking_info = f" · Tracking: {tracking_number}" if tracking_number else ""
            return f"Your order is on the way via {courier_name}{tracking_info}. Estimated arrival: {estimated_delivery}."
        if courier_name:
            return f"Your order has been shipped via {courier_name}."
        return "Your order has been handed over to the courier and is on the way."
    if status == "delivered":
        return "Your order has been delivered. Thank you for shopping with Floréa Haven!"
    if status == "cancelled":
        return "Your order was cancelled and any reserved items were returned to stock."
    if status == "refunded":
        return "Your order has been refunded."
    return None


def map_order(row, admin=False):
    result = {
        field: row.get(field)
        for field in (
            "id",
            "status",
            "status_updated_at",
            "payment_method",
            "delivery_address",
            "subtotal",
            "total_amount",
            "item_count",
            "preview_product_id",
            "preview_product_name",
            "preview_image_url",
            "preview_category_slug",
            "courier_name",
            "tracking_number",
            "estimated_delivery",
            "status_note",
            "created_at",
            "updated_at",
        )
    }
    if admin:
        result["customer"] = {
            "id": row["customer_id"],
            "name": row["customer_name"],
            "email": row["customer_email"],
        }
    return result


def get_order(order_id, user_id=None, admin=False):
    where, values = " WHERE o.id = %s", [order_id]
    if user_id is not None:
        where += " AND o.user_id = %s"
        values.append(user_id)
    row = one(ORDER_SELECT + where, values)
    if not row:
        missing("order")
    result = map_order(row, admin)
    result["items"] = rows(
        """SELECT oi.id, oi.product_id, oi.product_name, oi.sku, oi.unit_price,
                  oi.quantity, oi.line_total, oi.created_at,
                  p.image_url, c.slug AS category_slug
           FROM order_items oi
           LEFT JOIN products p ON p.id = oi.product_id
           LEFT JOIN categories c ON c.id = p.category_id
           WHERE oi.order_id = %s
           ORDER BY oi.created_at ASC, oi.id ASC""",
        (order_id,),
    )
    return result


def checkout_items(user_id, data):
    if "productId" in data:
        product = one("SELECT * FROM products WHERE id = %s FOR UPDATE", (data["productId"],))
        if not product:
            missing("product")
        if not product["is_active"]:
            raise ApiError(409, "PRODUCT_INACTIVE", "This product is no longer available.")
        if product["stock_quantity"] < data["quantity"]:
            raise ApiError(
                409,
                "INSUFFICIENT_STOCK",
                "The selected quantity is no longer available. Review the latest stock before trying again.",
            )
        if product["price"] != data["expectedUnitPrice"]:
            raise ApiError(
                409,
                "PRICE_CHANGED",
                "The price changed. Review the updated total before placing your order.",
            )
        return [
            {
                "product": product,
                "quantity": data["quantity"],
                "unit_price": product["price"],
                "line_total": product["price"] * data["quantity"],
                "availability": "available",
            }
        ]

    # Deterministic product lock order prevents cross-cart deadlocks.
    rows(
        """SELECT p.id FROM products p JOIN cart_items ci ON ci.product_id = p.id
            WHERE ci.user_id = %s ORDER BY p.id FOR UPDATE OF p""",
        (user_id,),
    )
    cart = get_cart(user_id)
    if not cart["items"]:
        raise ApiError(409, "EMPTY_CART", "Your cart is empty. Add an item before checking out.")
    if cart["revision"] != data["cartRevision"]:
        raise ApiError(
            409,
            "CART_CHANGED",
            "Your cart changed. Review the latest prices and availability before trying again.",
            {"cart": cart},
        )
    if "itemIds" in data:
        selected_ids = set(data["itemIds"])
        selected_items = [item for item in cart["items"] if str(item["id"]) in selected_ids]
        if not selected_items or len(selected_items) != len(selected_ids):
            raise ApiError(
                409,
                "CART_CHANGED",
                "Your cart changed. Review the latest prices and availability before trying again.",
                {"cart": cart},
            )
        return selected_items
    return cart["items"]


def place_order(user_id, key, data):
    request_fingerprint = fingerprint(data)
    with get_db().transaction():
        lock_customer(user_id)
        existing = one(
            "SELECT id, request_fingerprint FROM orders WHERE user_id = %s AND idempotency_key = %s",
            (user_id, key),
        )
        if existing:
            if existing["request_fingerprint"] != request_fingerprint:
                raise ApiError(
                    409,
                    "IDEMPOTENCY_CONFLICT",
                    "This checkout key was already used for different order details.",
                )
            return get_order(existing["id"], user_id), True
        items = checkout_items(user_id, data)
        for item in items:
            if item["availability"] == "inactive":
                raise ApiError(
                    409,
                    "PRODUCT_INACTIVE",
                    f"{item['product']['name']} is no longer available.",
                    {"productId": item["product"]["id"]},
                )
            if item["availability"] != "available":
                raise ApiError(
                    409,
                    "INSUFFICIENT_STOCK",
                    f"There is not enough stock to complete {item['product']['name']}.",
                    {"productId": item["product"]["id"]},
                )
        order_id = uuid4()
        subtotal = sum((item["unit_price"] * item["quantity"] for item in items), Decimal(0))
        execute(
            """INSERT INTO orders (id, user_id, idempotency_key, request_fingerprint,
                    subtotal, total_amount, payment_method, delivery_address)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)""",
            (
                order_id,
                user_id,
                key,
                request_fingerprint,
                subtotal,
                subtotal,
                data["paymentMethod"],
                Jsonb(data["deliveryAddress"]),
            ),
        )
        for item in items:
            product = item["product"]
            updated = execute(
                """UPDATE products SET stock_quantity = stock_quantity - %s,
                                 updated_at = CURRENT_TIMESTAMP WHERE id = %s AND is_active = TRUE
                                 AND stock_quantity >= %s AND price = %s""",
                (item["quantity"], product["id"], item["quantity"], item["unit_price"]),
            )
            if not updated.rowcount:
                raise ApiError(
                    409,
                    "CART_CHANGED",
                    "A product changed during checkout. Review your cart and try again.",
                )
            execute(
                """INSERT INTO order_items (id, order_id, product_id, product_name, sku,
                        unit_price, quantity, line_total) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)""",
                (
                    uuid4(),
                    order_id,
                    product["id"],
                    product["name"],
                    product["sku"],
                    item["unit_price"],
                    item["quantity"],
                    item["line_total"],
                ),
            )
        if "productId" not in data:
            if "itemIds" in data:
                execute(
                    "DELETE FROM cart_items WHERE user_id = %s AND id = ANY(%s::uuid[])",
                    (user_id, data["itemIds"]),
                )
            else:
                execute("DELETE FROM cart_items WHERE user_id = %s", (user_id,))
        return get_order(order_id, user_id), False


@bp.post("/orders")
@protected("customer")
def checkout():
    key = v.identifier(request.headers.get("Idempotency-Key"), "idempotencyKey")
    data = v.checkout_input()
    order, replayed = place_order(g.user["id"], key, data)
    return jsonify(data={"order": order, "idempotent_replay": replayed}), 200 if replayed else 201


@bp.post("/orders/buy-now")
@protected("customer")
def buy_now():
    key = v.identifier(request.headers.get("Idempotency-Key"), "idempotencyKey")
    data = v.checkout_input(direct=True)
    order, replayed = place_order(g.user["id"], key, data)
    return jsonify(data={"order": order, "idempotent_replay": replayed}), 200 if replayed else 201


def list_orders(admin=False):
    args = request.args
    page, limit = v.pagination(args, 20 if admin else 10, 100 if admin else 48)
    conditions, values = [], []
    if admin:
        search = v.string(args.get("search", ""), "search", 0, 100)
        customer = v.string(args.get("customer", ""), "customer", 0, 100)
        status = v.choice(args.get("status", "all"), "status", ["all", *TRANSITIONS])
        start = v.calendar_date(args["dateFrom"], "dateFrom") if "dateFrom" in args else None
        end = v.calendar_date(args["dateTo"], "dateTo") if "dateTo" in args else None
        if start and end and start > end:
            invalid("dateFrom", "The start date cannot be after the end date.")
        if search:
            conditions.append("CAST(o.id AS TEXT) ILIKE %s")
            values.append(f"%{search}%")
        if customer:
            conditions.append("(u.name ILIKE %s OR u.email ILIKE %s)")
            values += [f"%{customer}%"] * 2
        if status != "all":
            conditions.append("o.status = %s")
            values.append(status)
        if start:
            conditions.append("o.created_at >= %s")
            values.append(datetime.combine(start, time.min, timezone.utc))
        if end:
            conditions.append("o.created_at < %s")
            # PostgreSQL supports the day after 9999-12-31; Python datetime does not.
            if end.year == 9999 and end.month == 12 and end.day == 31:
                values.append("10000-01-01 00:00:00+00")
            else:
                values.append(datetime.combine(end + timedelta(days=1), time.min, timezone.utc))
    else:
        conditions.append("o.user_id = %s")
        values.append(g.user["id"])
    where = " WHERE " + " AND ".join(conditions) if conditions else ""
    total = one(
        "SELECT COUNT(*) AS total FROM orders o JOIN users u ON u.id = o.user_id" + where, values
    )["total"]
    records = rows(
        ORDER_SELECT + where + " ORDER BY o.created_at DESC, o.id DESC LIMIT %s OFFSET %s",
        [*values, limit, (page - 1) * limit],
    )
    return jsonify(
        data=[map_order(row, admin) for row in records], pagination=page_info(page, limit, total)
    )


@bp.get("/orders")
@protected("customer")
def customer_orders():
    return list_orders()


@bp.get("/orders/<order_id>")
@protected("customer")
def customer_order(order_id):
    return jsonify(data=get_order(v.identifier(order_id), g.user["id"]))


@bp.post("/orders/<order_id>/cancel")
@protected("customer")
def cancel_customer_order(order_id):
    order_id = v.identifier(order_id)
    payload = v.body({"reason", "details"})
    reason = v.string(payload.get("reason"), "reason", 2, 160)
    details = v.string(payload.get("details"), "details", 0, 300) if payload.get("details") else ""
    with get_db().transaction():
        order = one(
            "SELECT id, status, payment_method, total_amount FROM orders WHERE id = %s AND user_id = %s FOR UPDATE",
            (order_id, g.user["id"]),
        )
        if not order:
            missing("order")
        if order["status"] not in {"pending", "confirmed", "preparing"}:
            raise ApiError(
                409,
                "ORDER_NOT_CANCELLABLE",
                f"Orders with status '{order['status']}' can no longer be cancelled.",
                {"currentStatus": order["status"]},
            )
        items = rows(
            "SELECT product_id, quantity FROM order_items WHERE order_id = %s ORDER BY product_id",
            (order_id,),
        )
        for item in items:
            if item["product_id"]:
                execute(
                    "UPDATE products SET stock_quantity = stock_quantity + %s, updated_at = CURRENT_TIMESTAMP WHERE id = %s",
                    (item["quantity"], item["product_id"]),
                )
        payment_labels = {
            "gcash": "GCash",
            "maya": "Maya",
            "cash_on_delivery": "Cash on Delivery",
        }
        payment_label = payment_labels.get(order["payment_method"], "original payment method")
        reason_summary = f"{reason} ({details})" if details else reason
        status_note = (
            f"Cancelled by customer (Reason: {reason_summary}). "
            f"Refund of ₱{order['total_amount']:,.2f} processed via {payment_label} and items returned to stock."
        )
        execute(
            """UPDATE orders
               SET status = 'cancelled',
                   estimated_delivery = 'Order cancelled & refunded',
                   status_note = %s,
                   status_updated_at = CURRENT_TIMESTAMP,
                   updated_at = CURRENT_TIMESTAMP
               WHERE id = %s""",
            (status_note, order_id),
        )
        return jsonify(data=get_order(order_id, g.user["id"]))


@bp.get("/admin/orders")
@protected("staff")
def admin_orders():
    return list_orders(True)


@bp.get("/admin/orders/<order_id>")
@protected("staff")
def admin_order(order_id):
    return jsonify(data=get_order(v.identifier(order_id), admin=True))


@bp.put("/admin/orders/<order_id>/status")
@protected("staff")
def update_status(order_id):
    order_id = v.identifier(order_id)
    payload = v.body({"status", "courierName", "trackingNumber", "estimatedDelivery", "statusNote"})
    status = v.choice(payload.get("status"), "status", TRANSITIONS)
    courier_name = (
        v.string(payload["courierName"], "courierName", 2, 80)
        if payload.get("courierName")
        else None
    )
    tracking_number = (
        v.string(payload["trackingNumber"], "trackingNumber", 3, 60)
        if payload.get("trackingNumber")
        else None
    )
    estimated_delivery = (
        v.string(payload["estimatedDelivery"], "estimatedDelivery", 2, 120)
        if payload.get("estimatedDelivery")
        else None
    )
    status_note = (
        v.string(payload["statusNote"], "statusNote", 2, 300) if payload.get("statusNote") else None
    )
    with get_db().transaction():
        order = one(
            "SELECT status, courier_name, tracking_number, estimated_delivery FROM orders WHERE id = %s FOR UPDATE",
            (order_id,),
        )
        if not order:
            missing("order")
        allowed = TRANSITIONS[order["status"]]
        if status not in allowed:
            raise ApiError(
                409,
                "INVALID_STATUS_TRANSITION",
                f"An order cannot move from {order['status']} to {status}.",
                {
                    "currentStatus": order["status"],
                    "requestedStatus": status,
                    "allowedStatuses": allowed,
                },
            )
        effective_courier = courier_name or order.get("courier_name")
        effective_tracking = tracking_number or order.get("tracking_number")
        if effective_courier and (courier_name or not effective_tracking):
            if not tracking_number:
                effective_tracking = (
                    f"{tracking_prefix(effective_courier)}-{order_id.replace('-', '')[:8].upper()}"
                )
        effective_eta = estimated_delivery or order.get("estimated_delivery")
        effective_note = status_note or default_status_note(
            status, effective_courier, effective_tracking, effective_eta
        )
        if status == "cancelled" or (status == "refunded" and order["status"] != "cancelled"):
            items = rows(
                "SELECT product_id, quantity FROM order_items WHERE order_id = %s ORDER BY product_id",
                (order_id,),
            )
            for item in items:
                execute(
                    "UPDATE products SET stock_quantity = stock_quantity + %s, updated_at = CURRENT_TIMESTAMP WHERE id = %s",
                    (item["quantity"], item["product_id"]),
                )
        execute(
            """UPDATE orders
               SET status = %s,
                   courier_name = %s,
                   tracking_number = %s,
                   estimated_delivery = %s,
                   status_note = %s,
                   status_updated_at = CURRENT_TIMESTAMP,
                   updated_at = CURRENT_TIMESTAMP
               WHERE id = %s""",
            (
                status,
                effective_courier,
                effective_tracking,
                effective_eta,
                effective_note,
                order_id,
            ),
        )
        return jsonify(data=get_order(order_id, admin=True))
