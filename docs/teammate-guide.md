# Editing and debugging the HTML website

Every screen has its own HTML file. The browser loads its markup directly; JavaScript fills live data and handles actions such as signing in or placing an order. The Flask APIs and PostgreSQL database still perform the business operations.

## Open the website

From `Florea-Haven-project`, run `npm run dev`, then open **http://localhost:4000**. The Python environment, `.env`, and PostgreSQL must already be configured; follow the [README](../README.md) for initial setup.

Save a file and refresh the browser. Development uses the source files directly. `npm run build` copies them into `client/dist` for production; edit the source, not `dist`. Double-clicking an HTML file cannot connect it to the application's APIs.

## Find the screen

| Screen / URL                            | HTML to edit                                                             | JavaScript for its actions       |
| --------------------------------------- | ------------------------------------------------------------------------ | -------------------------------- |
| Home `/`                                | [client/index.html](../client/index.html)                                | `catalog.js`, `purchase.js`      |
| Catalog `/products`                     | [pages/products.html](../client/pages/products.html)                     | `catalog.js`, `purchase.js`      |
| Product `/products/:id`                 | [pages/product.html](../client/pages/product.html)                       | `catalog.js`, `purchase.js`      |
| Sign in `/login`                        | [pages/login.html](../client/pages/login.html)                           | `auth.js`                        |
| Register `/register`                    | [pages/register.html](../client/pages/register.html)                     | `auth.js`                        |
| Account `/account`                      | [pages/account.html](../client/pages/account.html)                       | `account.js`, `upload.js`        |
| Cart `/cart`                            | [pages/cart.html](../client/pages/cart.html)                             | `cart.js`                        |
| Checkout `/checkout`                    | [pages/checkout.html](../client/pages/checkout.html)                     | `checkout.js`                    |
| Order history `/orders`                 | [pages/orders.html](../client/pages/orders.html)                         | `orders.js`                      |
| Order `/orders/:id`                     | [pages/order.html](../client/pages/order.html)                           | `orders.js`                      |
| Confirmation `/orders/:id/confirmation` | [pages/order-confirmation.html](../client/pages/order-confirmation.html) | `orders.js`                      |
| Missing page                            | [pages/not-found.html](../client/pages/not-found.html)                   | Shared navigation only           |
| Admin dashboard `/admin`                | [admin/index.html](../client/admin/index.html)                           | Shared navigation only           |
| Admin products `/admin/products`        | [admin/products.html](../client/admin/products.html)                     | `admin-products.js`, `upload.js` |
| Admin categories `/admin/categories`    | [admin/categories.html](../client/admin/categories.html)                 | `admin-categories.js`            |
| Admin users `/admin/users`              | [admin/users.html](../client/admin/users.html)                           | `admin-users.js`                 |
| Admin orders `/admin/orders`            | [admin/orders.html](../client/admin/orders.html)                         | `admin-orders.js`                |
| Admin order `/admin/orders/:id`         | [admin/order.html](../client/admin/order.html)                           | `admin-orders.js`, `orders.js`   |

JavaScript files are under `client/js/`. `common.js` handles navigation, session display, cart badges, and themes on every page. `api.js` contains the API addresses and request helpers. Clean website URLs are mapped to HTML files in `backend/florea/frontend.py`.

## Explain how a page works

1. **HTML** defines what appears: headings, navigation, forms, buttons, dialogs, and reusable rows.
2. **CSS** defines how it looks: colors, fonts, spacing, breakpoints, animations, and themes.
3. **JavaScript** handles what happens: read a form, call an API, update a field, or clone a reusable row.
4. **Flask and PostgreSQL** validate requests, check permissions, and save the data.

For example, the login form is in `pages/login.html`. `auth.js` reads its email/password and calls `authApi.login` in `api.js`. Flask validates the credentials and sets the session cookie. The browser then navigates to the next HTML page.

## Make a small edit

For labels and descriptions, search the page's HTML for the visible words and edit the text between its tags. Regular links use `href`; forms contain named `input`, `select`, and `textarea` elements. Keep existing `id`, `name`, and `data-*` attributes when editing text, because event handlers use them to find the controls.

Reusable markup lives in a standard HTML `<template>` near the bottom of a page. A template is invisible until its JavaScript handler clones it. Edit `product-card-template` to change a product card, `purchase-template` to change the buy-now dialog, or `navigation-template` to change the mobile drawer.

```html
<h3 data-field="name">Product name</h3>
```

`data-field="name"` marks where the API's product name belongs. The words inside it are a placeholder; changing them will not rename a database product. Use **Admin → Products** to edit product data. JavaScript uses `textContent` for these values so data is treated as text.

Headers, footers, and drawers are deliberately present in each HTML document. A shared navigation edit must be repeated on the pages that use it. There is no component system or hidden build step.

[client/css/styles.css](../client/css/styles.css) imports the category files in order. Edit component styles in `client/css/components/` (for example, `buttons.css`, `navigation.css`, and `forms.css`). Shared defaults and theme variables live in `client/css/core/`; fonts, utilities, dark theme, responsive rules, animations, and HTML states have separate files in `client/css/`. Search that folder for a class to see its rule. The `:root` and `:root[data-theme='dark']` variables control the palettes. Preserve responsive rules when changing spacing; check desktop and mobile after an edit.

## Find the cause of a problem

Open browser developer tools with **F12**:

| Symptom                                            | First place to check                                                               |
| -------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Wrong wording, missing label, or misplaced element | **Elements** and that page's HTML file                                             |
| Wrong color, spacing, or mobile layout             | **Elements → Styles / Computed** and the relevant file in `css/`                   |
| Button does nothing                                | **Console** for an error; then the page's JavaScript file                          |
| Products do not load or a form fails               | **Network**, filter by `/api`, open the failed request and its **Response**        |
| Sign in or permissions fail                        | `/api/auth/me` response, login response, and Flask's terminal output               |
| The server will not start                          | Terminal output and [README setup](../README.md); check that PostgreSQL is running |

A `400` response usually reports invalid input; `401` means sign in is required; `403` means permission/origin checks failed; `409` means data changed or conflicts; `5xx` means a server/provider problem. Read the response's `error.message` and `error.details` to find the specific reason. Use the `X-Request-ID` response header to match a request to server logs. Do not share passwords, cookies, or `.env` contents in debugging screenshots.

In **Sources**, the files retain their original names because there is no bundle or minification. Put a breakpoint inside a button's event handler, perform the action, and step through the API call. Existing form inputs remain normal browser controls while live data refreshes.

After changes, run `npm run lint`, `npm run build`, and the relevant browser journeys. `npm run check` runs the complete suite and requires a test PostgreSQL connection. See [the migration record](frontend-migration.md) for test boundaries.
