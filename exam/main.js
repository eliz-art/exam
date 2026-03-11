// ==================== КОНСТАНТЫ И НАСТРОЙКИ ====================
const API_KEY = "b9ecd7b2-5483-48a9-a97f-ef1dce5dd8d9"; // Ваш API ключ (замените на свой)
const API_BASE_URL = "https://edu.std-900.ist.mospolytech.ru/exam-2024-1/api"; // Для GitHub Pages/Netlify
// const API_BASE_URL = "http://api.std-900.ist.mospolytech.ru"; // Для хостинга Политеха

// ==================== УТИЛИТЫ ====================

// Показ уведомлений (Toast) с цветовым оформлением
function showNotification(message, type = 'info') {
    const container = document.getElementById('notifications-container');
    if (!container) return;
    
    let bgClass = 'text-bg-primary'; // синий по умолчанию (информационное)
    if (type === 'success') bgClass = 'text-bg-success'; // зеленый (успех)
    if (type === 'error') bgClass = 'text-bg-danger'; // красный (ошибка)
    
    const toastId = 'toast-' + Date.now();
    const toastHtml = `
        <div id="${toastId}" class="toast align-items-center ${bgClass} border-0" role="alert" aria-live="assertive" aria-atomic="true">
            <div class="d-flex">
                <div class="toast-body">
                    ${message}
                </div>
                <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
            </div>
        </div>
    `;
    
    container.insertAdjacentHTML('beforeend', toastHtml);
    const toastEl = document.getElementById(toastId);
    const toast = new bootstrap.Toast(toastEl, { delay: 5000 });
    toast.show();
    
    // Автоматическое удаление из DOM после скрытия
    toastEl.addEventListener('hidden.bs.toast', () => {
        toastEl.remove();
    });
}

// Формат даты: "2024-01-20" -> "20.01.2024" (для отправки на сервер)
function formatDateToServer(isoDate) {
    if (!isoDate) return '';
    const [year, month, day] = isoDate.split('-');
    return `${day}.${month}.${year}`;
}

// Формат даты: "20.01.2024" -> "2024-01-20" (для input date)
function formatDateToInput(serverDate) {
    if (!serverDate) return '';
    if (serverDate.includes('T')) return serverDate.split('T')[0];
    const [day, month, year] = serverDate.split('.');
    return `${year}-${month}-${day}`;
}

// Формат даты: "2024-01-20T12:00:00" -> "20.01.2024" (для отображения)
function formatDateToDisplay(isoDateString) {
    const date = new Date(isoDateString);
    return date.toLocaleDateString('ru-RU');
}

// Универсальная функция запроса к API
async function fetchApi(endpoint, method = 'GET', body = null) {
    const url = new URL(`${API_BASE_URL}${endpoint}`);
    url.searchParams.append('api_key', API_KEY);

    const options = {
        method: method,
        headers: {}
    };

    if (body) {
        options.body = JSON.stringify(body);
        options.headers['Content-Type'] = 'application/json';
    }

    try {
        const response = await fetch(url, options);
        const data = await response.json();
        
        if (data.error) {
            throw new Error(data.error);
        }
        return data;
    } catch (error) {
        showNotification(error.message, 'error');
        throw error;
    }
}

// ==================== РАБОТА С КОРЗИНОЙ (LOCALSTORAGE) ====================

const Cart = {
    // Получить список ID товаров из корзины
    get() {
        return JSON.parse(localStorage.getItem('cart_ids')) || [];
    },
    
    // Добавить товар в корзину
    add(id) {
        const list = this.get();
        if (!list.includes(id)) {
            list.push(id);
            localStorage.setItem('cart_ids', JSON.stringify(list));
            this.updateBadge();
            showNotification('Товар добавлен в корзину', 'success');
        } else {
            showNotification('Товар уже в корзине', 'info');
        }
    },
    
    // Удалить товар из корзины
    remove(id) {
        const list = this.get().filter(item => item !== id);
        localStorage.setItem('cart_ids', JSON.stringify(list));
        this.updateBadge();
        showNotification('Товар удален из корзины', 'info');
    },
    
    // Очистить корзину
    clear() {
        localStorage.removeItem('cart_ids');
        this.updateBadge();
    },
    
    // Обновить счетчик на иконке корзины
    updateBadge() {
        const badge = document.getElementById('cart-badge');
        if (badge) {
            const count = this.get().length;
            badge.textContent = count;
            badge.classList.toggle('d-none', count === 0);
        }
    }
};

// ==================== ИНИЦИАЛИЗАЦИЯ СТРАНИЦ ====================

document.addEventListener('DOMContentLoaded', () => {
    const page = document.body.dataset.page;
    Cart.updateBadge(); // Обновить счетчик при загрузке

    if (page === 'catalog') initCatalog();
    if (page === 'cart') initCart();
    if (page === 'profile') initProfile();
});

// ==================== СТРАНИЦА КАТАЛОГА (ВАРИАНТ 3 - ФИЛЬТРАЦИЯ) ====================

function initCatalog() {
    // Состояние каталога
    let allGoods = []; // Все загруженные товары
    let filteredGoods = []; // Отфильтрованные товары
    let displayedCount = 0; // Количество отображенных товаров
    let uniqueCategories = new Set(); // Уникальные категории для фильтра
    
    // DOM элементы
    const grid = document.getElementById('catalog-grid');
    const loadMoreBtn = document.getElementById('load-more-btn');
    const categoriesContainer = document.getElementById('categories-container');
    const filterForm = document.getElementById('filter-form');
    const resetBtn = document.getElementById('reset-filters');
    const sortSelect = document.getElementById('sort-select');
    
    // Константы
    const ITEMS_PER_PAGE = 10; // Количество товаров на страницу

    // Загрузка всех товаров при инициализации
    loadAllGoods();

    /**
     * Загрузка всех товаров из API
     * Используем пагинацию для получения всех товаров
     */
    async function loadAllGoods() {
        try {
            showNotification('Загрузка каталога...', 'info');
            
            let page = 1;
            let allItems = [];
            let hasMore = true;
            
            // Загружаем все страницы с товарами
            while (hasMore) {
                const data = await fetchApi(`/goods?page=${page}&per_page=50`);
                const goods = Array.isArray(data) ? data : (data.goods || []);
                
                if (goods.length === 0) {
                    hasMore = false;
                } else {
                    allItems = [...allItems, ...goods];
                    page++;
                    
                    // Если получили меньше 50, значит это последняя страница
                    if (goods.length < 50) {
                        hasMore = false;
                    }
                }
            }
            
            allGoods = allItems;
            
            // Собираем уникальные категории для фильтра
            allGoods.forEach(item => {
                if (item.main_category) {
                    uniqueCategories.add(item.main_category);
                }
            });
            
            // Отображаем категории в фильтрах
            renderCategories();
            
            // Изначально показываем все товары
            filteredGoods = [...allGoods];
            applySorting(); // Применяем сортировку по умолчанию
            displayGoods(true); // Отображаем товары (первые 10)
            
            showNotification('Каталог загружен', 'success');
            
        } catch (error) {
            console.error('Ошибка загрузки товаров:', error);
            grid.innerHTML = '<div class="col-12 text-center p-5"><i class="fas fa-exclamation-triangle fa-3x text-danger mb-3"></i><h3>Ошибка загрузки</h3><p class="text-muted">Не удалось загрузить товары. Попробуйте позже.</p></div>';
        }
    }

    /**
     * Отображение категорий в боковой панели
     * Динамически создаем чекбоксы для каждой уникальной категории
     */
    function renderCategories() {
        if (!categoriesContainer) return;
        
        categoriesContainer.innerHTML = '';
        
        // Сортируем категории по алфавиту для удобства
        Array.from(uniqueCategories).sort().forEach(category => {
            const div = document.createElement('div');
            div.className = 'category-item';
            div.innerHTML = `
                <input type="checkbox" class="form-check-input category-checkbox" 
                       name="category" value="${category}" 
                       id="cat-${category.replace(/\s+/g, '-')}">
                <label for="cat-${category.replace(/\s+/g, '-')}">${category}</label>
            `;
            categoriesContainer.appendChild(div);
        });
    }

    /**
     * Функция сортировки товаров
     * Поддерживаются все варианты сортировки из задания
     */
    function sortGoods(goods, sortType) {
        const sorted = [...goods];
        
        switch(sortType) {
            case 'price_asc':
                // По возрастанию цены (учитываем скидку)
                sorted.sort((a, b) => {
                    const priceA = a.discount_price || a.actual_price;
                    const priceB = b.discount_price || b.actual_price;
                    return priceA - priceB;
                });
                break;
                
            case 'price_desc':
                // По убыванию цены (учитываем скидку)
                sorted.sort((a, b) => {
                    const priceA = a.discount_price || a.actual_price;
                    const priceB = b.discount_price || b.actual_price;
                    return priceB - priceA;
                });
                break;
                
            case 'rating_asc':
                // По возрастанию рейтинга
                sorted.sort((a, b) => a.rating - b.rating);
                break;
                
            case 'rating_desc':
                // По убыванию рейтинга
                sorted.sort((a, b) => b.rating - a.rating);
                break;
                
            default:
                // По умолчанию - без сортировки (по id)
                sorted.sort((a, b) => a.id - b.id);
                break;
        }
        
        return sorted;
    }

    /**
     * Применение текущей сортировки к отфильтрованным товарам
     */
    function applySorting() {
        const sortType = sortSelect?.value || 'default';
        filteredGoods = sortGoods(filteredGoods, sortType);
    }

    /**
     * Отображение товаров в сетке
     * @param {boolean} reset - сбросить ли отображение (если true - показываем с начала)
     */
    function displayGoods(reset = false) {
        if (reset) {
            displayedCount = 0;
            grid.innerHTML = '';
        }
        
        // Показываем следующую порцию товаров
        const nextItems = filteredGoods.slice(displayedCount, displayedCount + ITEMS_PER_PAGE);
        
        if (nextItems.length === 0) {
            // Если товаров нет, показываем сообщение
            if (displayedCount === 0) {
                grid.innerHTML = `
                    <div class="col-12 text-center p-5">
                        <i class="fas fa-box-open fa-3x text-muted mb-3"></i>
                        <h3>Товары не найдены</h3>
                        <p class="text-muted">Попробуйте изменить параметры фильтрации</p>
                    </div>
                `;
            }
            loadMoreBtn.classList.add('d-none');
            return;
        }
        
        // Рендерим товары
        renderGoods(nextItems);
        displayedCount += nextItems.length;
        
        // Показываем или скрываем кнопку "Загрузить ещё"
        if (displayedCount >= filteredGoods.length) {
            loadMoreBtn.classList.add('d-none');
        } else {
            loadMoreBtn.classList.remove('d-none');
        }
    }

    /**
     * Рендеринг карточек товаров
     * @param {Array} goods - массив товаров для отображения
     */
    function renderGoods(goods) {
        goods.forEach(item => {
            // Определяем цену для отображения (со скидкой или без)
            const finalPrice = item.discount_price || item.actual_price;
            
            // Формируем HTML для цены
            const priceHtml = item.discount_price 
                ? `<span class="old-price">${item.actual_price} ₽</span>
                   <span class="current-price">${item.discount_price} ₽</span>`
                : `<span class="current-price">${item.actual_price} ₽</span>`;

            // Генерируем звезды рейтинга
            const stars = '★'.repeat(Math.round(item.rating)) + 
                         '☆'.repeat(5 - Math.round(item.rating));

            const card = document.createElement('div');
            card.className = 'good-card';
            card.dataset.id = item.id;
            card.dataset.price = finalPrice;
            card.dataset.rating = item.rating;

            // Обрезаем длинное название (больше 50 символов)
            const shortName = item.name.length > 50 
                ? item.name.substring(0, 50) + '...' 
                : item.name;

            card.innerHTML = `
                <div class="good-image">
                    <img src="${item.image_url}" alt="${item.name}" loading="lazy">
                </div>
                <div class="good-content">
                    <h3 class="good-name" title="${item.name}">${shortName}</h3>
                    <div class="good-rating">
                        <span class="stars">${stars}</span>
                        <span class="rating-value">${item.rating.toFixed(1)}</span>
                    </div>
                    <div class="good-category">${item.main_category}</div>
                    <div class="good-price">
                        ${priceHtml}
                    </div>
                    <button class="add-to-cart-btn" data-id="${item.id}">
                        <i class="fas fa-cart-plus me-2"></i>В корзину
                    </button>
                </div>
            `;
            
            grid.appendChild(card);
        });

        // Добавляем обработчики для кнопок "В корзину"
        document.querySelectorAll('.add-to-cart-btn').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                const id = parseInt(e.currentTarget.dataset.id);
                Cart.add(id);
            };
        });
    }

    /**
     * ОСНОВНАЯ ФУНКЦИЯ ФИЛЬТРАЦИИ
     * Применяет все выбранные пользователем фильтры
     */
    function applyFilters() {
        // Собираем данные из формы
        const formData = new FormData(filterForm);
        
        // Получаем выбранные категории (может быть несколько)
        const selectedCategories = formData.getAll('category');
        
        // Получаем значения цен (могут быть пустыми)
        const minPrice = formData.get('price_min') ? parseFloat(formData.get('price_min')) : null;
        const maxPrice = formData.get('price_max') ? parseFloat(formData.get('price_max')) : null;
        
        // Флаг "только со скидкой"
        const discountOnly = formData.get('discount_only') === 'on';

        // Начинаем с полного списка товаров
        let result = [...allGoods];

        // === ФИЛЬТРАЦИЯ ПО КАТЕГОРИЯМ ===
        // Если выбраны какие-то категории, оставляем только товары из этих категорий
        if (selectedCategories.length > 0) {
            result = result.filter(good => 
                selectedCategories.includes(good.main_category)
            );
        }

        // === ФИЛЬТРАЦИЯ ПО ЦЕНЕ ===
        // Применяем фильтр по цене, учитывая скидку
        result = result.filter(good => {
            // Берем цену со скидкой, если есть, иначе обычную цену
            const price = good.discount_price || good.actual_price;
            
            // Проверяем минимальную цену (если задана)
            if (minPrice !== null && price < minPrice) {
                return false;
            }
            
            // Проверяем максимальную цену (если задана)
            if (maxPrice !== null && price > maxPrice) {
                return false;
            }
            
            return true;
        });

        // === ФИЛЬТРАЦИЯ ПО НАЛИЧИЮ СКИДКИ ===
        // Если отмечен чекбокс "Товары со скидкой"
        if (discountOnly) {
            result = result.filter(good => 
                good.discount_price !== null && good.discount_price > 0
            );
        }

        // Сохраняем отфильтрованные товары
        filteredGoods = result;
        
        // Применяем текущую сортировку
        applySorting();
        
        // Отображаем товары (сброс к началу)
        displayGoods(true);
        
        // Показываем результат пользователю
        showNotification(`Найдено товаров: ${filteredGoods.length}`, 'info');
    }

    // ========== ОБРАБОТЧИКИ СОБЫТИЙ ==========

    // Кнопка "Применить" - запускает фильтрацию
    if (filterForm) {
        filterForm.onsubmit = (e) => {
            e.preventDefault(); // Предотвращаем отправку формы
            applyFilters();
        };
    }

    // Кнопка "Сбросить" - очищает все фильтры
    if (resetBtn) {
        resetBtn.onclick = () => {
            filterForm.reset(); // Сбрасываем форму
            filteredGoods = [...allGoods]; // Возвращаем все товары
            applySorting(); // Применяем сортировку
            displayGoods(true); // Отображаем товары
            showNotification('Фильтры сброшены', 'info');
        };
    }

    // Изменение сортировки
    if (sortSelect) {
        sortSelect.onchange = () => {
            applySorting(); // Пересортировываем текущие отфильтрованные товары
            displayGoods(true); // Отображаем с начала
        };
    }

    // Кнопка "Загрузить ещё" - пагинация
    if (loadMoreBtn) {
        loadMoreBtn.onclick = () => {
            displayGoods(false); // Загружаем следующую порцию
        };
    }

    // ========== ПОИСК И АВТОДОПОЛНЕНИЕ ==========

    const searchInput = document.getElementById('search-input');
    const searchBtn = document.getElementById('search-btn');
    const autocompleteList = document.getElementById('autocomplete-list');
    let debounceTimer;

    // Обработчик поиска
    if (searchBtn && searchInput) {
        searchBtn.onclick = () => {
            const query = searchInput.value.toLowerCase().trim();
            
            if (!query) {
                // Если запрос пустой, просто применяем фильтры
                applyFilters();
                return;
            }

            // Фильтруем товары по названию
            let searchResults = allGoods.filter(good => 
                good.name.toLowerCase().includes(query)
            );
            
            // Применяем текущие фильтры к результатам поиска
            const formData = new FormData(filterForm);
            const selectedCategories = formData.getAll('category');
            const minPrice = formData.get('price_min') ? parseFloat(formData.get('price_min')) : null;
            const maxPrice = formData.get('price_max') ? parseFloat(formData.get('price_max')) : null;
            const discountOnly = formData.get('discount_only') === 'on';

            // Фильтр по категориям
            if (selectedCategories.length > 0) {
                searchResults = searchResults.filter(g => 
                    selectedCategories.includes(g.main_category)
                );
            }

            // Фильтр по цене
            searchResults = searchResults.filter(g => {
                const price = g.discount_price || g.actual_price;
                if (minPrice !== null && price < minPrice) return false;
                if (maxPrice !== null && price > maxPrice) return false;
                return true;
            });

            // Фильтр по скидке
            if (discountOnly) {
                searchResults = searchResults.filter(g => 
                    g.discount_price !== null && g.discount_price > 0
                );
            }

            // Сохраняем и отображаем результаты
            filteredGoods = searchResults;
            applySorting();
            displayGoods(true);
            
            if (searchResults.length === 0) {
                showNotification('Ничего не найдено', 'info');
            } else {
                showNotification(`Найдено товаров: ${searchResults.length}`, 'info');
            }
        };
    }

    // Автодополнение поискового запроса
    if (searchInput && autocompleteList) {
        searchInput.oninput = (e) => {
            clearTimeout(debounceTimer);
            const query = e.target.value;
            
            if (query.length < 2) {
                autocompleteList.innerHTML = '';
                return;
            }

            debounceTimer = setTimeout(async () => {
                try {
                    // Запрос к API автодополнения
                    const suggestions = await fetchApi(`/autocomplete?query=${encodeURIComponent(query)}`);
                    
                    autocompleteList.innerHTML = '';
                    
                    // Показываем первые 5 подсказок
                    suggestions.slice(0, 5).forEach(item => {
                        const btn = document.createElement('button');
                        btn.className = 'list-group-item list-group-item-action';
                        btn.textContent = item;
                        btn.onclick = () => {
                            searchInput.value = item;
                            autocompleteList.innerHTML = '';
                            searchBtn.click(); // Запускаем поиск
                        };
                        autocompleteList.appendChild(btn);
                    });
                } catch (e) {
                    console.error('Ошибка автодополнения:', e);
                }
            }, 300);
        };

        // Скрываем автодополнение при клике вне поля поиска
        document.addEventListener('click', (e) => {
            if (!e.target.closest('#navbarContent')) {
                autocompleteList.innerHTML = '';
            }
        });
    }
}

// ==================== СТРАНИЦА КОРЗИНЫ ====================

function initCart() {
    const container = document.getElementById('cart-items-container');
    const orderSection = document.getElementById('order-section');
    const ids = Cart.get();
    let loadedItems = [];

    if (ids.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-shopping-cart"></i>
                <h3>Корзина пуста</h3>
                <p>Перейдите в каталог, чтобы добавить товары.</p>
                <a href="index.html" class="btn btn-primary mt-3">
                    <i class="fas fa-store me-2"></i>Перейти в каталог
                </a>
            </div>
        `;
        if (orderSection) orderSection.style.display = 'none';
        return;
    }

    // Загрузка данных товаров из API
    (async () => {
        container.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';
        
        try {
            // Загружаем все товары параллельно
            const promises = ids.map(id => fetchApi(`/goods/${id}`).catch(err => {
                console.error(`Ошибка загрузки товара ${id}:`, err);
                return null;
            }));
            const results = await Promise.all(promises);
            loadedItems = results.filter(item => item !== null);
            
            if (loadedItems.length === 0) {
                container.innerHTML = '<div class="empty-state"><p>Не удалось загрузить товары</p></div>';
                return;
            }
            
            renderCartItems();
            calcTotal();
        } catch (e) {
            container.innerHTML = '<div class="empty-state"><p>Ошибка загрузки товаров</p></div>';
        }
    })();

    function renderCartItems() {
        container.innerHTML = '';
        
        loadedItems.forEach(item => {
            const finalPrice = item.discount_price || item.actual_price;
            const stars = '★'.repeat(Math.round(item.rating)) + '☆'.repeat(5 - Math.round(item.rating));

            const card = document.createElement('div');
            card.className = 'cart-item';
            card.dataset.id = item.id;

            card.innerHTML = `
                <div class="cart-item-image">
                    <img src="${item.image_url}" alt="${item.name}" loading="lazy">
                </div>
                <div class="cart-item-content">
                    <h4 class="cart-item-name" title="${item.name}">${item.name.length > 40 ? item.name.substring(0, 40) + '...' : item.name}</h4>
                    <div class="good-rating">
                        <span class="stars">${stars}</span>
                        <span class="rating-value">${item.rating.toFixed(1)}</span>
                    </div>
                    <div class="cart-item-price">${finalPrice} ₽</div>
                    <button class="remove-btn" data-id="${item.id}">
                        <i class="fas fa-trash-alt me-2"></i>Удалить
                    </button>
                </div>
            `;
            
            container.appendChild(card);
        });

        // Обработчики удаления
        document.querySelectorAll('.remove-btn').forEach(btn => {
            btn.onclick = (e) => {
                const id = parseInt(e.currentTarget.dataset.id);
                Cart.remove(id);
                loadedItems = loadedItems.filter(i => i.id !== id);
                renderCartItems();
                calcTotal();
                
                if (loadedItems.length === 0) {
                    container.innerHTML = `
                        <div class="empty-state">
                            <i class="fas fa-shopping-cart"></i>
                            <h3>Корзина пуста</h3>
                            <p>Перейдите в каталог, чтобы добавить товары.</p>
                            <a href="index.html" class="btn btn-primary mt-3">
                                <i class="fas fa-store me-2"></i>Перейти в каталог
                            </a>
                        </div>
                    `;
                    if (orderSection) orderSection.style.display = 'none';
                }
            };
        });
    }

    // Расчет стоимости доставки
    const dateInput = document.getElementById('delivery-date');
    const intervalSelect = document.getElementById('delivery-interval');
    const finalPriceEl = document.getElementById('final-price');
    const deliveryCostEl = document.getElementById('delivery-cost');

    function calcTotal() {
        const goodsSum = loadedItems.reduce((acc, item) => acc + (item.discount_price || item.actual_price), 0);
        let deliveryPrice = 200; // Базовая стоимость

        const dateVal = dateInput?.value;
        const intervalVal = intervalSelect?.value;

        if (dateVal) {
            const date = new Date(dateVal);
            const day = date.getDay(); // 0 - воскресенье, 6 - суббота
            
            // Выходные дни
            if (day === 0 || day === 6) {
                deliveryPrice += 300;
            } 
            // Вечерние часы в будни (18:00-22:00)
            else if (intervalVal === '18:00-22:00') {
                deliveryPrice += 200;
            }
        }

        if (finalPriceEl) finalPriceEl.textContent = goodsSum + deliveryPrice;
        if (deliveryCostEl) deliveryCostEl.textContent = deliveryPrice;
    }

    if (dateInput) dateInput.addEventListener('change', calcTotal);
    if (intervalSelect) intervalSelect.addEventListener('change', calcTotal);

    // Отправка формы заказа
    const orderForm = document.getElementById('order-form');
    if (orderForm) {
        orderForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const formData = new FormData(orderForm);
            
            // Преобразование даты в формат сервера (dd.mm.yyyy)
            const rawDate = formData.get('delivery_date');
            const formattedDate = formatDateToServer(rawDate);

            const orderData = {
                full_name: formData.get('full_name'),
                email: formData.get('email'),
                phone: formData.get('phone'),
                subscribe: formData.get('subscribe') === 'on' ? 1 : 0,
                delivery_address: formData.get('delivery_address'),
                delivery_date: formattedDate,
                delivery_interval: formData.get('delivery_interval'),
                comment: formData.get('comment') || '',
                good_ids: loadedItems.map(i => i.id)
            };

            // Валидация
            if (!orderData.full_name || !orderData.email || !orderData.phone || !orderData.delivery_address) {
                showNotification('Заполните все обязательные поля', 'error');
                return;
            }

            try {
                showNotification('Оформление заказа...', 'info');
                const result = await fetchApi('/orders', 'POST', orderData);
                
                showNotification('Заказ успешно оформлен!', 'success');
                Cart.clear(); // Очищаем корзину
                
                // Перенаправление на главную через 2 секунды
                setTimeout(() => {
                    window.location.href = 'index.html';
                }, 2000);
                
            } catch (error) {
                showNotification('Ошибка при оформлении заказа', 'error');
            }
        });
    }
}

// ==================== СТРАНИЦА ЛИЧНОГО КАБИНЕТА ====================

function initProfile() {
    const tbody = document.getElementById('orders-table-body');
    
    // Инициализация модальных окон Bootstrap
    const editModalEl = document.getElementById('orderModal');
    const deleteModalEl = document.getElementById('deleteModal');
    
    let editModal, deleteModal;
    if (editModalEl) editModal = new bootstrap.Modal(editModalEl);
    if (deleteModalEl) deleteModal = new bootstrap.Modal(deleteModalEl);

    let currentDeleteId = null;

    // Загрузка заказов
    loadOrders();

    async function loadOrders() {
        if (!tbody) return;
        
        tbody.innerHTML = '<tr><td colspan="6" class="text-center">Загрузка...</td></tr>';
        
        try {
            const orders = await fetchApi('/orders');
            
            // Сортировка: новые сверху
            orders.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            
            tbody.innerHTML = '';
            
            if (orders.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" class="text-center">У вас пока нет заказов</td></tr>';
                return;
            }

            // Загружаем информацию о товарах для подсчета стоимости
            const allGoodIds = [...new Set(orders.flatMap(order => order.good_ids))];
            const goodsPromises = allGoodIds.map(id => fetchApi(`/goods/${id}`).catch(() => null));
            const goodsResults = await Promise.all(goodsPromises);
            
            const goodsMap = new Map();
            goodsResults.forEach(good => {
                if (good) goodsMap.set(good.id, good);
            });

            // Отображаем заказы
            orders.forEach((order, index) => {
                const dateStr = formatDateToDisplay(order.created_at);
                const timeStr = order.created_at.split('T')[1]?.substring(0, 5) || '';
                
                // Подсчет стоимости заказа
                const totalPrice = order.good_ids.reduce((sum, id) => {
                    const good = goodsMap.get(id);
                    return sum + (good ? (good.discount_price || good.actual_price) : 0);
                }, 0);

                const tr = document.createElement('tr');
                tr.dataset.id = order.id;
                tr.innerHTML = `
                    <td>${index + 1}</td>
                    <td>${dateStr}<br><small class="text-muted">${timeStr}</small></td>
                    <td>
                        <span class="text-truncate d-inline-block" style="max-width: 200px;" title="${order.good_ids.join(', ')}">
                            ${order.good_ids.join(', ')}
                        </span>
                    </td>
                    <td>${totalPrice} ₽</td>
                    <td>${order.delivery_date}<br><small>${order.delivery_interval}</small></td>
                    <td>
                        <div class="order-actions">
                            <button class="action-btn view" data-id="${order.id}" title="Просмотр">
                                <i class="fas fa-eye"></i>
                            </button>
                            <button class="action-btn edit" data-id="${order.id}" title="Редактировать">
                                <i class="fas fa-pencil-alt"></i>
                            </button>
                            <button class="action-btn delete" data-id="${order.id}" title="Удалить">
                                <i class="fas fa-trash-alt"></i>
                            </button>
                        </div>
                    </td>
                `;
                tbody.appendChild(tr);
            });

            // Добавляем обработчики для кнопок
            setupTableActions();

        } catch (error) {
            tbody.innerHTML = `<tr><td colspan="6" class="text-danger text-center">Ошибка загрузки: ${error.message}</td></tr>`;
        }
    }

    function setupTableActions() {
        // Удаление
        document.querySelectorAll('.action-btn.delete').forEach(btn => {
            btn.onclick = () => {
                currentDeleteId = btn.dataset.id;
                if (deleteModal) deleteModal.show();
            };
        });

        // Просмотр и редактирование
        document.querySelectorAll('.action-btn.view, .action-btn.edit').forEach(btn => {
            btn.onclick = async () => {
                const isEdit = btn.classList.contains('edit');
                const id = btn.dataset.id;
                await openOrderModal(id, isEdit);
            };
        });
    }

    // Обработчик подтверждения удаления
    const confirmDeleteBtn = document.getElementById('confirm-delete-btn');
    if (confirmDeleteBtn) {
        confirmDeleteBtn.onclick = async () => {
            if (!currentDeleteId) return;
            
            try {
                await fetchApi(`/orders/${currentDeleteId}`, 'DELETE');
                showNotification('Заказ успешно удален', 'success');
                
                // Удаляем строку из таблицы
                const row = document.querySelector(`tr[data-id="${currentDeleteId}"]`);
                if (row) row.remove();
                
                // Обновляем нумерацию
                const rows = document.querySelectorAll('#orders-table-body tr');
                rows.forEach((row, idx) => {
                    const firstCell = row.querySelector('td:first-child');
                    if (firstCell) firstCell.textContent = idx + 1;
                });
                
                deleteModal.hide();
                
                // Если заказов не осталось, показываем сообщение
                if (rows.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="6" class="text-center">У вас пока нет заказов</td></tr>';
                }
                
            } catch (error) {
                showNotification('Ошибка при удалении заказа', 'error');
            }
        };
    }

    // Открытие модального окна для просмотра/редактирования
    async function openOrderModal(id, isEdit) {
        const form = document.getElementById('edit-order-form');
        const saveBtn = document.getElementById('save-order-btn');
        const title = document.getElementById('modalTitle');

        if (!form || !saveBtn || !title) return;

        form.reset();
        
        try {
            const order = await fetchApi(`/orders/${id}`);
            
            // Заполняем форму
            form.querySelector('[name="id"]').value = order.id;
            form.querySelector('[name="full_name"]').value = order.full_name;
            form.querySelector('[name="email"]').value = order.email;
            form.querySelector('[name="phone"]').value = order.phone;
            form.querySelector('[name="delivery_address"]').value = order.delivery_address;
            form.querySelector('[name="delivery_date"]').value = formatDateToInput(order.delivery_date);
            form.querySelector('[name="delivery_interval"]').value = order.delivery_interval;
            form.querySelector('[name="comment"]').value = order.comment || '';

            // Блокируем поля для просмотра
            const inputs = form.querySelectorAll('input, select, textarea');
            inputs.forEach(el => {
                if (el.name !== 'id') {
                    el.disabled = !isEdit;
                }
            });
            
            if (isEdit) {
                title.textContent = 'Редактирование заказа';
                saveBtn.classList.remove('d-none');
            } else {
                title.textContent = 'Просмотр заказа';
                saveBtn.classList.add('d-none');
            }

            if (editModal) editModal.show();
            
        } catch (error) {
            showNotification('Ошибка загрузки заказа', 'error');
        }
    }

    // Сохранение изменений
    const saveOrderBtn = document.getElementById('save-order-btn');
    if (saveOrderBtn) {
        saveOrderBtn.onclick = async () => {
            const form = document.getElementById('edit-order-form');
            if (!form) return;
            
            const id = form.querySelector('[name="id"]').value;
            
            const orderData = {
                full_name: form.querySelector('[name="full_name"]').value,
                email: form.querySelector('[name="email"]').value,
                phone: form.querySelector('[name="phone"]').value,
                delivery_address: form.querySelector('[name="delivery_address"]').value,
                delivery_date: formatDateToServer(form.querySelector('[name="delivery_date"]').value),
                delivery_interval: form.querySelector('[name="delivery_interval"]').value,
                comment: form.querySelector('[name="comment"]').value
            };

            try {
                await fetchApi(`/orders/${id}`, 'PUT', orderData);
                showNotification('Заказ успешно обновлен', 'success');
                
                if (editModal) editModal.hide();
                loadOrders(); // Перезагружаем список заказов
                
            } catch (error) {
                showNotification('Ошибка при обновлении заказа', 'error');
            }
        };
    }
}