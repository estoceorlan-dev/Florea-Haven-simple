import { catalogApi } from './api.js';
import { pageReady } from './common.js';
import { enablePurchases, openPurchase } from './purchase.js';
import {
  find,
  findAll,
  fillText,
  copyTemplate,
  currency,
  setImage,
  updateStock,
  showError,
  watchAvailability,
  formValues,
  updatePagination,
} from './helpers.js';

const products = new Map();
const page = document.body.dataset.page;
const query = new URLSearchParams(location.search);
const categoryPhotos = {
  flowers: [
    'Gathered with care',
    'https://images.unsplash.com/photo-1490750967868-88aa4486c946?auto=format&fit=crop&w=1000&q=85',
  ],
  seeds: [
    'For what comes next',
    'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?auto=format&fit=crop&w=1000&q=85',
  ],
  perfumes: [
    'A garden, remembered',
    'https://images.unsplash.com/photo-1541643600914-78b084683601?auto=format&fit=crop&w=1000&q=85',
  ],
};

function fillProduct(root, product) {
  root.dataset.productId = product.id;
  products.set(product.id, product);
  fillText(root, {
    name: product.name,
    category: product.category.name,
    price: currency(product.price),
    description: product.description,
    sku: `Product code · ${product.sku}`,
  });
  for (const image of findAll('[data-field=image]', root))
    setImage(image, product.image_url, product.name);
  for (const link of findAll('[data-product-link]', root)) {
    link.href = `/products/${product.id}`;
    if (link.querySelector('img'))
      link.setAttribute('aria-label', `View ${product.name}`);
  }
  const categoryLink = find('a[data-field=category]', root);
  if (categoryLink) categoryLink.href = `/products?category=${product.category.slug}`;
  for (const element of findAll('[data-featured]', root))
    element.hidden = !product.featured;
  const unavailable = updateStock(root, product.stock_quantity);
  for (const button of findAll('[data-buy-now], [data-add-cart]', root)) {
    button.disabled = unavailable || product.is_active === false;
    if (button.hasAttribute('data-add-cart'))
      button.setAttribute('aria-label', `Add ${product.name} to cart`);
  }
}

function navigateFilters(changes) {
  const parameters = new URLSearchParams(location.search);
  parameters.delete('page');
  for (const [name, value] of Object.entries(changes)) {
    if (value === '' || value == null) parameters.delete(name);
    else parameters.set(name, value);
  }
  location.assign('/products' + (parameters.size ? '?' + parameters : ''));
}

async function loadCatalog() {
  if (find('dialog[open]')) return;
  try {
    const params =
      page === 'home'
        ? { featured: true, limit: 4 }
        : { ...Object.fromEntries(query), limit: 9 };
    const result = await catalogApi.getProducts(params);
    const list = find('#product-list');
    const rows = result.data.map((product) => {
      const row = copyTemplate('product-card-template');
      fillProduct(row, product);
      return row;
    });
    list.replaceChildren(...rows);
    const empty = find('#empty-state');
    if (empty) empty.hidden = rows.length !== 0;
    fillText(document, {
      'list-summary': `${result.pagination?.total ?? rows.length} pieces`,
    });
    updatePagination(result.pagination);
    showError(null);
  } catch (error) {
    showError(error);
  }
}

async function loadCategories() {
  const categories = (await catalogApi.getCategories()).data;
  if (page === 'home') {
    find('#category-list').replaceChildren(
      ...categories.map((category, index) => {
        const card = copyTemplate('category-card-template');
        const [label, photo] = categoryPhotos[category.slug] ?? [
          'Chosen with care',
          categoryPhotos.flowers[1],
        ];
        fillText(card, {
          name: category.name,
          label,
          number:
            { flowers: '01', seeds: '02', perfumes: '03' }[category.slug] ??
            String(index + 1).padStart(2, '0'),
          count: `${category.product_count} pieces`,
        });
        card.href = `/products?category=${category.slug}`;
        setImage(find('img', card), photo, '');
        return card;
      }),
    );
  }
  const list = find('#category-filters');
  if (list) {
    const make = (slug, title, count) => {
      const link = copyTemplate('category-filter-template');
      fillText(link, { name: title, count });
      find('[data-field=count]', link).hidden = !slug;
      const params = new URLSearchParams(query);
      params.delete('page');
      if (slug) params.set('category', slug);
      else params.delete('category');
      link.href = '/products' + (params.size ? '?' + params : '');
      const active = (query.get('category') ?? '') === slug;
      link.classList.toggle('filter-option-active', active);
      if (active) link.setAttribute('aria-current', 'page');
      return link;
    };
    list.replaceChildren(
      make('', 'All pieces'),
      ...categories.map((category) =>
        make(category.slug, category.name, category.product_count),
      ),
    );
  }
}

// Connect filters before requesting data, so initialization never resets typed input.
const search = find('#catalog-search-form');
if (search) {
  search.elements.search.value = query.get('search') ?? '';
  search.addEventListener('submit', (event) => {
    event.preventDefault();
    navigateFilters({ search: search.elements.search.value.trim() });
  });
  const sort = find('#catalog-sort');
  sort.value = query.get('sort') ?? 'featured';
  sort.addEventListener('change', () => navigateFilters({ sort: sort.value }));
  const price = find('#price-filter-form');
  price.elements.minPrice.value = query.get('minPrice') ?? '';
  price.elements.maxPrice.value = query.get('maxPrice') ?? '';
  price.addEventListener('submit', (event) => {
    event.preventDefault();
    navigateFilters(formValues(price));
  });
  find('[data-toggle-filters]')?.addEventListener('click', (event) => {
    const hidden = find('#catalog-filters').classList.toggle('hidden');
    event.currentTarget.setAttribute('aria-expanded', String(!hidden));
  });
}

if (await pageReady) {
  enablePurchases(products);
  if (page === 'product') {
    const id = /^\/products\/([^/]+)$/.exec(location.pathname)?.[1] ?? query.get('id');
    const loadProduct = async () => {
      try {
        fillProduct(find('#product-details'), (await catalogApi.getProduct(id)).data);
        showError(null);
      } catch (error) {
        showError(error);
      }
    };
    await loadProduct();
    if (query.get('buy') === '1' && products.has(id))
      openPurchase(products.get(id), find('[data-buy-now]'), query.get('quantity'));
    watchAvailability(loadProduct);
  } else {
    try {
      await loadCategories();
    } catch (error) {
      showError(error);
    }
    await loadCatalog();
    watchAvailability(loadCatalog);
  }
}
