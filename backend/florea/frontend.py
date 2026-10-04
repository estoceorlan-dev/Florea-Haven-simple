"""Map the existing website URLs to ordinary HTML documents."""

PAGES = {
    "": "index.html",
    "products": "pages/products.html",
    "login": "pages/login.html",
    "register": "pages/register.html",
    "account": "pages/account.html",
    "cart": "pages/cart.html",
    "checkout": "pages/checkout.html",
    "orders": "pages/orders.html",
    "admin": "admin/index.html",
    "admin/products": "admin/products.html",
    "admin/categories": "admin/categories.html",
    "admin/users": "admin/users.html",
    "admin/orders": "admin/orders.html",
}


def document_for_path(path):
    clean = path.strip("/")
    if clean in PAGES:
        return PAGES[clean]
    parts = clean.split("/")
    if len(parts) == 2 and parts[0] == "products":
        return "pages/product.html"
    if len(parts) == 2 and parts[0] == "orders":
        return "pages/order.html"
    if len(parts) == 3 and parts[0] == "orders" and parts[2] == "confirmation":
        return "pages/order-confirmation.html"
    if len(parts) == 3 and parts[:2] == ["admin", "orders"]:
        return "admin/order.html"
    return "pages/not-found.html"
