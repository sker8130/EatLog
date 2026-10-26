import { watchAppAuth, logout } from './auth.js';
import { getMyEntries, getDiscoverData, addPlaceWithEntry,
  updateMyEntry, deleteMyEntry, addFromAnotherList } from './firestore.js';
import { isSoundEnabled, toggleSound, playTap } from './sound.js';

// Đổi danh mục tem tại đây; không cần chỉnh CSS hoặc Firestore.
const TAG_GROUPS = Object.freeze({
  price: ['Ăn giàu', 'Ăn vừa túi', 'Ăn nghèo'],
  style: ['Ăn nhẹ', 'Ăn no', 'Ăn nhậu', 'Buffet']
});
// Dữ liệu quán cũ không có restaurantCategory được hiểu là Quán ăn.
const CATEGORIES = Object.freeze([
  { id: 'restaurant', label: 'Quán ăn' },
  { id: 'outing', label: 'Đi chơi' },
  { id: 'snack', label: 'Ăn vặt' },
  { id: 'cafe', label: 'Cafe' },
  { id: 'matcha', label: 'Matcha map' }
]);
const categoryOf = entry => CATEGORIES.some(item => item.id === entry?.restaurantCategory)
  ? entry.restaurantCategory : 'restaurant';
const categoryLabel = id => CATEGORIES.find(item => item.id === id)?.label || 'Quán ăn';
const isRestaurant = id => id === 'restaurant';
const RATINGS = { good: 'Ngon', ok: 'Ổn', bad: 'Đã ăn mà dở' };
const STATUSES = { want_to_try: 'Chưa thử', eaten: 'Đã ăn' };
const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[char]);
const safePhoto = url => {
  try { const value = new URL(url); return ['https:', 'http:'].includes(value.protocol) ? value.href : ''; }
  catch (_) { return ''; }
};
const state = {
  user: null, mine: [], users: [], otherEntries: [], discovered: false,
  activeTab: 'mine', selectedUserId: null, loadingMine: true,
  filters: {
    mine: { category: 'restaurant', status: 'want_to_try', district: '', tags: new Set(), rating: '', search: '' },
    discover: { category: 'restaurant', status: 'want_to_try', district: '', tags: new Set(), rating: '', search: '' }
  },
  modal: { mode: 'add', entry: null, category: 'restaurant', status: 'want_to_try', rating: null, tags: new Set(), dishes: [] },
  saving: false
};
let toastTimer;

function messageFor(error) {
  if (error?.code === 'permission-denied') return 'Bạn không có quyền thực hiện thao tác này. Hãy kiểm tra Firestore Rules.';
  if (error?.code === 'unavailable') return 'Mất kết nối Firebase. Vui lòng thử lại.';
  if (error?.code === 'failed-precondition') return 'Firestore cần cấu hình bổ sung để xử lý yêu cầu.';
  // Các lỗi do ứng dụng chủ động phát ra được phép hiển thị trực tiếp.
  return error?.code ? 'Có lỗi xảy ra khi lưu dữ liệu. Vui lòng thử lại.' : error?.message || 'Có lỗi xảy ra.';
}
function toast(text, isError = false) {
  const el = $('#toast');
  el.textContent = text;
  el.classList.toggle('is-error', isError);
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2700);
}
function avatar(user, small = false) {
  const name = user?.displayName || user?.email?.split('@')[0] || 'Bạn';
  const photo = safePhoto(user?.photoURL);
  const size = small ? ' avatar-small' : '';
  return `<span class="avatar${size}"><span class="avatar-letter">${esc(name.charAt(0).toLocaleUpperCase('vi'))}</span>${photo ? `<img src="${esc(photo)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}</span>`;
}
function empty(title, description) {
  return `<div class="empty-state"><h3>${esc(title)}</h3><p>${esc(description)}</p></div>`;
}
function loading(text) {
  return `<div class="loading-state"><span class="spinner" aria-hidden="true"></span>${esc(text)}</div>`;
}
function entriesFor(view) {
  return view === 'mine' ? state.mine : state.otherEntries.filter(entry => entry.userId === state.selectedUserId);
}
function categoryEntries(view) {
  return entriesFor(view).filter(entry => categoryOf(entry) === state.filters[view].category);
}
function filtered(view) {
  const f = state.filters[view];
  return categoryEntries(view).filter(entry => {
    const tags = Array.isArray(entry.tags) ? entry.tags : [];
    const restaurantOK = !isRestaurant(f.category) || (
      entry.status === f.status && [...f.tags].every(tag => tags.includes(tag))
      && (f.status !== 'eaten' || !f.rating || f.rating === entry.rating)
    );
    return restaurantOK && (!f.district || entry.restaurantDistrict === f.district)
      && String(entry.restaurantName ?? '').toLocaleLowerCase('vi').includes(f.search.trim().toLocaleLowerCase('vi'));
  });
}
// Icon SVG nét mảnh giúp cả năm nhóm thống nhất, không phụ thuộc thư viện ngoài.
const CATEGORY_GLYPHS = {
  restaurant: '<path d="M5 3v7m3-7v7M5 7h3M6.5 10v11M16 3c-3 2.5-3.5 7-3.5 10H16v8"/>',
  outing: '<path d="M12 21s7-5 7-12a7 7 0 0 0-14 0c0 7 7 12 7 12Z"/><circle cx="12" cy="9" r="2.4"/>',
  snack: '<path d="M20.5 11.5A8.5 8.5 0 1 1 12.5 3c-.5 2.3 1.3 4 3.7 3.8-.8 2.1.7 4.2 4.3 4.7Z"/><circle cx="9" cy="10" r="1"/><circle cx="14" cy="15" r="1"/><path d="m8 16 .5.5"/>',
  cafe: '<path d="M4 8h13v7a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V8Zm13 1h2a3 3 0 0 1 0 6h-2M9 3v2m4-2v2"/>'
};
function categoryIcon(category) {
  if (category.id === 'matcha') {
    return '<span class="category-icon matcha-icon"><img src="./assets/matcha-ico.png" alt="" onerror="this.hidden=true"></span>';
  }
  return `<span class="category-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${CATEGORY_GLYPHS[category.id]}</svg></span>`;
}
function categoryButtons(selected) {
  return CATEGORIES.map(cat => `<button type="button" class="category-tab${cat.id === selected ? ' is-active' : ''}"
    data-category="${cat.id}" aria-pressed="${cat.id === selected}">
    ${categoryIcon(cat)}<span>${cat.label}</span></button>`).join('');
}
function renderCategories(view) {
  $(`#${view}-category-tabs`).innerHTML = categoryButtons(state.filters[view].category);
}
function renderStatus(view) {
  const statusTabs = $(`#${view}-status-tabs`);
  statusTabs.hidden = !isRestaurant(state.filters[view].category);
  if (statusTabs.hidden) { statusTabs.innerHTML = ''; return; }
  const entries = categoryEntries(view);
  const active = state.filters[view].status;
  statusTabs.innerHTML = Object.entries(STATUSES).map(([key, label]) =>
    `<button type="button" class="status-tab${key === active ? ' is-active' : ''}" data-status="${key}" aria-pressed="${key === active}">${label}<span class="status-count">${entries.filter(item => item.status === key).length}</span></button>`
  ).join('');
}

function chipMarkup(tag, group, selected, filterMode = false) {
  return `<button class="chip chip-${group}${selected ? ' is-active' : ''}" data-${filterMode ? 'filter-' : ''}tag="${esc(tag)}" data-group="${group}" type="button" aria-pressed="${selected}">${esc(tag)}</button>`;
}
// Dropdown khu vực dùng chung cho List của tôi và Khám phá.
function districtDropdownMarkup(view, districts, selected) {
  const options = [
    { value: '', label: 'Tất cả khu vực' },
    ...districts.map(district => ({ value: district, label: district }))
  ];
  const selectedLabel = options.find(item => item.value === selected)?.label || 'Tất cả khu vực';
  return `<div class="district-dropdown" data-district-dropdown>
    <button id="${view}-district" type="button" class="district-trigger"
      data-district-trigger aria-expanded="false"
      aria-controls="${view}-district-panel"
      aria-labelledby="${view}-district-label ${view}-district-value">
      <span id="${view}-district-value" class="district-value" data-district-value>${esc(selectedLabel)}</span>
      <span class="district-chevron" aria-hidden="true">›</span>
    </button>
    <div id="${view}-district-panel" class="district-panel" data-district-panel inert>
      <ul class="district-list webkit-scrollbar" role="list">
        ${options.map(item => `<li class="district-item"><button type="button"
          class="district-option${item.value === selected ? ' is-selected' : ''}"
          data-district-option="${esc(item.value)}" aria-pressed="${item.value === selected}">
          <span>${esc(item.label)}</span>
          <span class="district-selected-mark" aria-hidden="true">✓</span>
        </button></li>`).join('')}
      </ul>
    </div>
  </div>`;
}

function setDistrictDropdownOpen(dropdown, open) {
  if (!dropdown) return;
  dropdown.classList.toggle('is-open', open);
  const trigger = dropdown.querySelector('[data-district-trigger]') || dropdown.querySelector('#restaurant-district');
  trigger?.setAttribute('aria-expanded', String(open));
  dropdown.querySelector('[data-form-district-toggle]')?.setAttribute('aria-expanded', String(open));
  // inert chặn tab và click vào các mục khi menu đã đóng.
  dropdown.querySelector('[data-district-panel]').inert = !open;
}

function renderFilters(view) {
  const f = state.filters[view];
  const districts = [...new Set(categoryEntries(view).map(entry => entry.restaurantDistrict).filter(Boolean))]
    .sort((a,b) => a.localeCompare(b, 'vi'));
  const food = isRestaurant(f.category);
  $(`#${view}-filters`).innerHTML = `
    <div class="filter-main">
      <div class="filter-field"><label for="${view}-search">Tìm ${food ? 'quán' : 'địa điểm'}</label><input id="${view}-search" data-filter="search" type="search" value="${esc(f.search)}" placeholder="${food ? 'Tên quán bạn đang nhớ…' : 'Tìm tên địa điểm…'}"></div>
      <div class="filter-field"><label id="${view}-district-label" for="${view}-district">Quận / huyện</label>${districtDropdownMarkup(view, districts, f.district)}</div>
    </div>
    ${food ? `<div class="filter-tags">
      <div class="filter-group"><span class="filter-label">Mức chi</span>${TAG_GROUPS.price.map(tag => chipMarkup(tag, 'price', f.tags.has(tag), true)).join('')}</div>
      <div class="filter-group"><span class="filter-label">Kiểu ăn</span>${TAG_GROUPS.style.map(tag => chipMarkup(tag, 'style', f.tags.has(tag), true)).join('')}</div>
    </div>
    ${f.status === 'eaten' ? `<div class="filter-rating"><span class="filter-label">Đánh giá</span><button class="rating-filter${!f.rating ? ' is-active' : ''}" data-filter-rating="" type="button">Tất cả</button>${Object.entries(RATINGS).map(([key, label]) => `<button type="button" class="rating-filter${key === 'bad' ? ' is-bad' : ''}${f.rating === key ? ' is-active' : ''}" data-filter-rating="${key}">${label}</button>`).join('')}</div>` : ''}` : ''}`;
}

function ratingBadge(rating) {
  return RATINGS[rating] ? `<span class="rating-badge ${rating}">${RATINGS[rating]}</span>` : '';
}
function cardMarkup(entry, index, other = false) {
  const category = categoryOf(entry);
  const food = isRestaurant(category);
  const tags = Array.isArray(entry.tags) ? entry.tags : [];
  const dishes = Array.isArray(entry.dishes) ? entry.dishes : [];
  const already = state.mine.some(item => item.restaurantId === entry.restaurantId);
  const content = `
    <div class="card-topline"><span class="card-number">ĐIỂM ĐẾN #${String(index + 1).padStart(3, '0')}</span><span class="card-district">${esc(entry.restaurantDistrict || 'Chưa có quận')}</span></div>
    <h3>${esc(entry.restaurantName || 'Chưa có tên')}</h3><hr class="card-divider">
    ${food ? `<div class="card-tags">${tags.map(tag => `<span class="card-tag ${TAG_GROUPS.price.includes(tag) ? 'price' : 'style'}">${esc(tag)}</span>`).join('')}${ratingBadge(entry.rating)}</div>
    ${dishes.length ? `<p class="card-dishes"><strong>Món lưu:</strong> ${esc(dishes.slice(0,3).join(' · '))}${dishes.length > 3 ? '…' : ''}</p>` : ''}` :
    entry.restaurantAddress ? `<p class="card-address">${esc(entry.restaurantAddress)}</p>` : ''}
    ${entry.note ? `<p class="card-note">${esc(entry.note)}</p>` : ''}`;
  const action = other
    ? already ? '<div class="card-action-added">Đã có trong list của bạn</div>'
      : `<button type="button" class="btn btn-primary" data-copy="${esc(entry.id)}">+ Thêm vào list của tôi</button>`
    : food && entry.status === 'want_to_try'
      ? `<button type="button" class="btn btn-primary" data-ate="${esc(entry.id)}">Đã ăn rồi</button>` : '';
  return `<article class="restaurant-card paper" style="--card-index:${index}">
    ${other ? `<div>${content}</div>` : `<button type="button" class="card-click" data-edit="${esc(entry.id)}" aria-label="Xem và sửa ${esc(entry.restaurantName)}">${content}</button>`}
    ${action ? `<div class="card-actions">${action}</div>` : ''}
  </article>`;
}
function renderCards(view) {
  const container = $(`#${view}-cards`);
  if (view === 'mine' && state.loadingMine) { container.innerHTML = loading('Đang mở sổ tay…'); return; }
  const items = filtered(view);
  if (!items.length) {
    const f = state.filters[view];
    const noData = categoryEntries(view).filter(entry => !isRestaurant(f.category) || entry.status === f.status).length === 0;
    container.innerHTML = noData
      ? view === 'mine' ? empty('Trang giấy còn trống', `Chưa có địa điểm nào trong ${categoryLabel(f.category)}. Bấm + để thêm địa điểm đầu tiên.`)
        : empty('Chưa có địa điểm nào', 'Người này chưa lưu địa điểm ở danh mục này.')
      : empty('Chưa tìm thấy địa điểm', 'Thử thay đổi bộ lọc hoặc tìm tên khác nhé.');
    return;
  }
  container.innerHTML = items.map((entry, index) => cardMarkup(entry, index, view === 'discover')).join('');
}
function renderMine() { renderCategories('mine'); renderStatus('mine'); renderFilters('mine'); renderCards('mine'); }

function renderDiscoverUsers() {
  const list = state.users.filter(user => user.id !== state.user.uid).sort((a,b) => (a.displayName || '').localeCompare(b.displayName || '', 'vi'));
  $('#discover-users').innerHTML = list.length ? list.map(user => {
    const count = state.otherEntries.filter(entry => entry.userId === user.id).length;
    return `<button class="user-card paper" type="button" data-user="${esc(user.id)}">${avatar(user)}<span><strong>${esc(user.displayName || 'Người dùng')}</strong><small>${count} quán trong sổ</small></span><span class="user-arrow">→</span></button>`;
  }).join('') : empty('Chưa có cuốn sổ khác', 'Khi có người khác đăng ký, danh sách của họ sẽ xuất hiện ở đây.');
}
function renderDiscoverList() {
  const owner = state.users.find(user => user.id === state.selectedUserId);
  if (!owner) return;
  $('#discover-owner').innerHTML = `${avatar(owner)}<span><strong>${esc(owner.displayName || 'Người dùng')}</strong><small>${entriesFor('discover').length} quán được lưu</small></span>`;
  renderCategories('discover'); renderStatus('discover'); renderFilters('discover'); renderCards('discover');
}
async function loadMine() {
  try {
    state.mine = await getMyEntries(state.user.uid);
    state.loadingMine = false;
    renderMine();
    if (state.selectedUserId) renderDiscoverList();
  } catch (error) {
    state.loadingMine = false;
    $('#mine-cards').innerHTML = empty('Không tải được sổ tay', messageFor(error));
    toast(messageFor(error), true);
  }
}
async function loadDiscover() {
  $('#discover-users').innerHTML = loading('Đang tìm các sổ tay…');
  try {
    const data = await getDiscoverData();
    state.users = data.users;
    state.otherEntries = data.entries;
    state.discovered = true;
    renderDiscoverUsers();
    if (state.selectedUserId) renderDiscoverList();
  } catch (error) {
    $('#discover-users').innerHTML = empty('Chưa tải được', 'Hãy thử mở lại tab Khám phá.');
    toast(messageFor(error), true);
  }
}
function changeTab(tab) {
  state.activeTab = tab;
  $('#mine-view').hidden = tab !== 'mine';
  $('#discover-view').hidden = tab !== 'discover';
  $('#add-button').hidden = tab !== 'mine';
  document.querySelectorAll('.nav-tab').forEach(button => {
    const active = button.dataset.tab === tab;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-current', active ? 'page' : 'false');
  });
  if (tab === 'discover') {
    if (!state.discovered) void loadDiscover();
    else if (state.selectedUserId) renderDiscoverList();
    else renderDiscoverUsers();
  }
}
function selectUser(uid) {
  state.selectedUserId = uid;
  state.filters.discover = { category: 'restaurant', status: 'want_to_try', district: '', tags: new Set(), rating: '', search: '' };
  $('#discover-users-panel').hidden = true;
  $('#discover-list-panel').hidden = false;
  renderDiscoverList();
}
function switchCategory(view, category) {
  if (!CATEGORIES.some(item => item.id === category)) return;
  const f = state.filters[view];
  f.category = category;
  f.status = 'want_to_try';
  f.district = '';
  f.tags.clear();
  f.rating = '';
  f.search = '';
  renderCategories(view); renderStatus(view); renderFilters(view); renderCards(view);
  if (view === 'mine') {
    const label = categoryLabel(category);
    $('#add-button').setAttribute('aria-label', `Thêm vào ${label}`);
    $('#add-button').title = `Thêm vào ${label}`;
  }
}
function toggleFilterTag(view, tag, group) {
  const tags = state.filters[view].tags;
  if (tags.has(tag)) tags.delete(tag);
  else {
    if (group === 'price') TAG_GROUPS.price.forEach(value => tags.delete(value));
    tags.add(tag);
  }
  playTap(); renderFilters(view); renderCards(view);
}
function wireFilters(view) {
  const area = $(`#${view}-filters`);
  area.addEventListener('input', event => {
    if (event.target.dataset.filter === 'search') {
      state.filters[view].search = event.target.value;
      renderCards(view);
    }
  });
  area.addEventListener('click', event => {
    const trigger = event.target.closest('[data-district-trigger]');
    if (trigger) {
      const dropdown = trigger.closest('[data-district-dropdown]');
      setDistrictDropdownOpen(dropdown, !dropdown.classList.contains('is-open'));
      return;
    }
    const option = event.target.closest('[data-district-option]');
    if (option) {
      const dropdown = option.closest('[data-district-dropdown]');
      const district = option.dataset.districtOption;
      state.filters[view].district = district;
      dropdown.querySelector('[data-district-value]').textContent = option.querySelector('span').textContent;
      dropdown.querySelectorAll('[data-district-option]').forEach(item => {
        const selected = item.dataset.districtOption === district;
        item.classList.toggle('is-selected', selected);
        item.setAttribute('aria-pressed', String(selected));
      });
      setDistrictDropdownOpen(dropdown, false);
      dropdown.querySelector('[data-district-trigger]').focus();
      renderCards(view);
      return;
    }
    const chip = event.target.closest('[data-filter-tag]');
    const rating = event.target.closest('[data-filter-rating]');
    if (chip) toggleFilterTag(view, chip.dataset.filterTag, chip.dataset.group);
    if (rating) {
      state.filters[view].rating = rating.dataset.filterRating;
      renderFilters(view); renderCards(view);
    }
  });
  // Hỗ trợ Escape, các phím mũi tên và Tab khi thao tác bằng bàn phím.
  area.addEventListener('keydown', event => {
    const dropdown = event.target.closest('[data-district-dropdown]');
    if (!dropdown) return;
    const trigger = dropdown.querySelector('[data-district-trigger]');
    const options = [...dropdown.querySelectorAll('[data-district-option]')];
    if (event.key === 'Escape' && dropdown.classList.contains('is-open')) {
      event.preventDefault();
      setDistrictDropdownOpen(dropdown, false);
      trigger.focus();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setDistrictDropdownOpen(dropdown, true);
      const current = options.indexOf(document.activeElement);
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      const next = current < 0 ? (direction === 1 ? 0 : options.length - 1)
        : (current + direction + options.length) % options.length;
      options[next]?.focus();
    }
  });
  area.addEventListener('focusout', event => {
    const dropdown = event.target.closest('[data-district-dropdown]');
    if (dropdown && !dropdown.contains(event.relatedTarget)) {
      setDistrictDropdownOpen(dropdown, false);
    }
  });
  $(`#${view}-status-tabs`).addEventListener('click', event => {
    const button = event.target.closest('[data-status]');
    if (!button) return;
    state.filters[view].status = button.dataset.status;
    state.filters[view].rating = '';
    renderStatus(view); renderFilters(view); renderCards(view);
  });
}
// Biến input + datalist có sẵn thành dropdown giấy, vẫn nhập quận tự do được.
function setupFormDistrictDropdown() {
  const input = $('#restaurant-district');
  const source = $('#hcm-districts');
  if (!input || !source || input.closest('[data-form-district]')) return;
  const suggestions = [...source.querySelectorAll('option')]
    .map(option => option.value).filter(Boolean);

  // Không dùng popup datalist mặc định để tránh hai danh sách chồng lên nhau.
  input.removeAttribute('list');
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-haspopup', 'listbox');
  input.setAttribute('aria-expanded', 'false');
  input.setAttribute('aria-controls', 'restaurant-district-suggestions');
  input.setAttribute('autocomplete', 'off');
  input.placeholder = 'Chọn hoặc gõ quận / huyện…';

  const dropdown = document.createElement('div');
  dropdown.className = 'district-dropdown district-combobox';
  dropdown.setAttribute('data-district-dropdown', '');
  dropdown.setAttribute('data-form-district', '');
  const control = document.createElement('div');
  control.className = 'district-combobox-control';
  input.before(dropdown);
  dropdown.append(control);
  control.append(input);
  control.insertAdjacentHTML('beforeend', `
    <button type="button" class="district-combobox-toggle" data-form-district-toggle
      aria-label="Mở danh sách quận, huyện" aria-expanded="false"
      aria-controls="restaurant-district-suggestions">
      <span class="district-chevron" aria-hidden="true">›</span>
    </button>`);
  dropdown.insertAdjacentHTML('beforeend', `
    <div class="district-panel district-combobox-panel" data-district-panel inert>
      <ul id="restaurant-district-suggestions" class="district-list webkit-scrollbar"
          role="listbox" aria-label="Gợi ý quận, huyện"></ul>
    </div>`);
  const list = dropdown.querySelector('.district-list');
  const button = dropdown.querySelector('[data-form-district-toggle]');
  const fold = text => String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D').toLocaleLowerCase('vi').trim();

  function renderSuggestions() {
    const value = fold(input.value);
    const filtered = suggestions.filter(place => fold(place).includes(value));
    list.innerHTML = filtered.length
      ? filtered.map((place, i) => `<li class="district-item" role="presentation">
          <button id="form-district-option-${i}" type="button" role="option" class="district-option${place === input.value ? ' is-selected' : ''}"
            data-form-district-option="${esc(place)}" aria-selected="${place === input.value}">
            <span>${esc(place)}</span><span class="district-selected-mark" aria-hidden="true">✓</span>
          </button></li>`).join('')
      : `<li class="district-no-match" role="presentation">Không có gợi ý phù hợp.<small>Bạn vẫn có thể nhập khu vực khác.</small></li>`;
  }
  function choose(place) {
    input.value = place;
    // Trả focus về input trước, sau đó đóng để tránh tự mở lại qua focus.
    input.focus({ preventScroll: true });
    setDistrictDropdownOpen(dropdown, false);
  }

  input.addEventListener('focus', () => {
    renderSuggestions();
    setDistrictDropdownOpen(dropdown, true);
  });
  // Input có thể còn focus khi mở lại modal, nên tap vẫn phải mở danh sách.
  input.addEventListener('click', () => {
    if (!dropdown.classList.contains('is-open')) {
      renderSuggestions();
      setDistrictDropdownOpen(dropdown, true);
    }
  });
  input.addEventListener('input', () => {
    renderSuggestions();
    setDistrictDropdownOpen(dropdown, true);
  });
  button.addEventListener('click', () => {
    const shouldOpen = !dropdown.classList.contains('is-open');
    if (shouldOpen) renderSuggestions();
    setDistrictDropdownOpen(dropdown, shouldOpen);
  });
  list.addEventListener('click', event => {
    const option = event.target.closest('[data-form-district-option]');
    if (option) choose(option.dataset.formDistrictOption);
  });
  dropdown.addEventListener('keydown', event => {
    if (event.key === 'Escape' && dropdown.classList.contains('is-open')) {
      event.preventDefault();
      event.stopPropagation(); // Không đóng cả dialog khi chỉ muốn đóng dropdown.
      input.focus({ preventScroll: true });
      setDistrictDropdownOpen(dropdown, false);
      return;
    }
    const options = [...list.querySelectorAll('[data-form-district-option]')];
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!dropdown.classList.contains('is-open')) {
        renderSuggestions();
        setDistrictDropdownOpen(dropdown, true);
      }
      const available = [...list.querySelectorAll('[data-form-district-option]')];
      const current = available.indexOf(document.activeElement);
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      const next = current < 0 ? (direction === 1 ? 0 : available.length - 1)
        : (current + direction + available.length) % available.length;
      available[next]?.focus();
    } else if (event.key === 'Enter' && event.target === input && dropdown.classList.contains('is-open')) {
      // Enter không vô tình gửi toàn bộ form khi đang chọn/gõ tên khu vực.
      event.preventDefault();
      if (options.length === 1) choose(options[0].dataset.formDistrictOption);
      else setDistrictDropdownOpen(dropdown, false);
    }
  });
  dropdown.addEventListener('focusout', event => {
    if (!dropdown.contains(event.relatedTarget)) setDistrictDropdownOpen(dropdown, false);
  });
}

function refreshFormOptions() {
  const modal = state.modal;
  const food = isRestaurant(modal.category);
  $('#food-only-fields').hidden = !food;
  $('#form-category-field').hidden = modal.mode === 'edit';
  $('#form-category').innerHTML = categoryButtons(modal.category);
  $('#place-name-label').textContent = food ? 'Tên quán' : 'Tên địa điểm';
  $('#restaurant-name').placeholder = food ? 'Ví dụ: Bún bò cô Ba' : 'Ví dụ: Tên địa điểm muốn lưu';
  $('#restaurant-note').placeholder = food ? 'Điều gì khiến bạn nhớ quán này?' : 'Ghi chú về địa điểm này…';
  if (modal.mode === 'add') {
    $('#modal-title').textContent = `Thêm ${categoryLabel(modal.category)}`;
    $('#save-entry').textContent = food ? 'Lưu quán' : 'Lưu địa điểm';
  }
  $('#rating-field').hidden = modal.status !== 'eaten';
  $('#form-status').querySelectorAll('[data-status]').forEach(button => {
    const active = button.dataset.status === modal.status;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', active);
  });
  $('#form-rating').querySelectorAll('[data-rating]').forEach(button => {
    const active = button.dataset.rating === modal.rating;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', active);
  });
  $('#form-price-tags').innerHTML = TAG_GROUPS.price.map(tag => chipMarkup(tag, 'price', modal.tags.has(tag))).join('');
  $('#form-style-tags').innerHTML = TAG_GROUPS.style.map(tag => chipMarkup(tag, 'style', modal.tags.has(tag))).join('');
  $('#dish-list').innerHTML = modal.dishes.map((dish, index) => `<span class="dish-item">${esc(dish)}<button type="button" class="dish-remove" data-remove-dish="${index}" aria-label="Xoá món ${esc(dish)}">×</button></span>`).join('');
}
function openModal(mode, entry = null) {
  const modal = state.modal;
  modal.mode = mode;
  modal.entry = entry;
  modal.category = entry ? categoryOf(entry) : state.filters.mine.category;
  modal.status = entry?.status || 'want_to_try';
  modal.rating = entry?.rating || null;
  modal.tags = new Set(entry?.tags || []);
  modal.dishes = [...(entry?.dishes || [])];
  $('#entry-form').reset();
  $('#modal-error').hidden = true;
  // Ẩn thông tin cố định khi sửa trang ghi
  const isEdit = mode === 'edit';

  $('#restaurant-fields').hidden = isEdit;

  // Chỉ bắt buộc nhập tên và quận khi thêm địa điểm mới
  $('#restaurant-name').required = !isEdit;
  $('#restaurant-district').required = !isEdit;
  $('#restaurant-static').hidden = mode !== 'edit';
  $('#delete-entry').hidden = mode !== 'edit';
  $('#modal-eyebrow').textContent = mode === 'add' ? 'GHI THÊM MỘT CHỖ' : 'TRANG GHI CỦA BẠN';
  $('#modal-title').textContent = mode === 'add' ? `Thêm ${categoryLabel(modal.category)}` : `Sửa ${categoryLabel(modal.category)}`;
  $('#save-entry').textContent = mode === 'add' ? 'Lưu địa điểm' : 'Lưu thay đổi';
  if (entry) {
    $('#restaurant-static').innerHTML = `<strong>${esc(entry.restaurantName)}</strong><small>${esc(entry.restaurantDistrict)}${entry.restaurantAddress ? ' · ' + esc(entry.restaurantAddress) : ''}</small>`;
    $('#restaurant-note').value = entry.note || '';
  }
  refreshFormOptions();
  $('#entry-modal').showModal();
  // Dialog có thể nhớ vị trí cuộn từ lần thêm trước.
  $('#entry-modal').scrollTop = 0;
}
function addDish() {
  const input = $('#dish-input');
  const dish = input.value.trim().replace(/\s+/g, ' ');
  if (!dish) return;
  if (!state.modal.dishes.includes(dish)) state.modal.dishes.push(dish);
  input.value = '';
  refreshFormOptions();
  input.focus();
}
function modalPayload() {
  return {
    category: state.modal.category,
    name: $('#restaurant-name').value.trim(),
    district: $('#restaurant-district').value.trim(),
    address: $('#restaurant-address').value.trim(),
    status: state.modal.status, rating: state.modal.rating,
    tags: [...state.modal.tags], dishes: [...state.modal.dishes],
    note: $('#restaurant-note').value.trim()
  };
}
function setSaving(value) {
  state.saving = value;
  $('#save-entry').disabled = value;
  $('#delete-entry').disabled = value;
}
async function saveModal(event) {
  event.preventDefault();
  if (state.saving) return;
  const payload = modalPayload();
  if (state.modal.mode === 'add' && (!payload.name || !payload.district)) {
    $('#modal-error').textContent = 'Vui lòng nhập tên địa điểm và quận / huyện.';
    $('#modal-error').hidden = false;
    return;
  }
  playTap(); setSaving(true);
  try {
    // Món đang nhập nhưng chưa bấm "Thêm món" vẫn được ghi nhận.
    const pendingDish = isRestaurant(state.modal.category) ? $('#dish-input').value.trim() : '';
    if (pendingDish && !payload.dishes.includes(pendingDish)) payload.dishes.push(pendingDish);
    if (state.modal.mode === 'add') {
      const result = await addPlaceWithEntry(state.user.uid, payload);
      toast(result.alreadyExists ? 'Địa điểm đã có trong list của bạn.' : 'Đã thêm địa điểm vào sổ tay!');
    } else {
      await updateMyEntry(state.user.uid, state.modal.entry.id, payload);
      toast('Đã lưu thay đổi!');
    }
    $('#entry-modal').close();
    await loadMine();
  } catch (error) {
    $('#modal-error').textContent = messageFor(error);
    $('#modal-error').hidden = false;
    toast(messageFor(error), true);
  } finally { setSaving(false); }
}
async function deleteModalEntry() {
  if (state.saving || !state.modal.entry) return;
  if (!window.confirm('Xoá địa điểm này khỏi list của bạn? Dữ liệu dùng chung vẫn được giữ lại.')) return;
  setSaving(true);
  try {
    await deleteMyEntry(state.user.uid, state.modal.entry.id);
    $('#entry-modal').close();
    await loadMine();
    toast('Đã xoá địa điểm khỏi list.');
  } catch (error) { toast(messageFor(error), true); }
  finally { setSaving(false); }
}
async function markAsEaten(id) {
  const entry = state.mine.find(item => item.id === id);
  if (!entry) return;
  playTap();
  try {
    await updateMyEntry(state.user.uid, id, { ...entry, status: 'eaten', rating: null });
    await loadMine();
    const updated = state.mine.find(item => item.id === id);
    if (updated) openModal('edit', updated);
    toast('Đã chuyển sang Đã ăn. Hãy ghi đánh giá của bạn!');
  } catch (error) { toast(messageFor(error), true); }
}
async function copyFromUser(id) {
  const entry = state.otherEntries.find(item => item.id === id && item.userId === state.selectedUserId);
  if (!entry) return;
  playTap();
  const button = [...document.querySelectorAll('[data-copy]')].find(el => el.dataset.copy === id);
  if (button) button.disabled = true;
  try {
    const result = await addFromAnotherList(state.user.uid, entry.id, entry.userId);
    await loadMine();
    toast(result.alreadyExists ? 'Địa điểm đã có trong list của bạn.' : 'Đã thêm vào danh sách của bạn!');
  } catch (error) {
    if (button) button.disabled = false;
    toast(messageFor(error), true);
  }
}
function setAccountMenuOpen(open) {
  const menu = $("#account-menu");
  const button = $("#account-button");

  menu.classList.toggle("is-open", open);
  menu.inert = !open;

  button.setAttribute("aria-expanded", String(open));
}
function bindEvents() {
  setupFormDistrictDropdown();
  wireFilters('mine'); wireFilters('discover');
  ['mine', 'discover'].forEach(view => {
    $(`#${view}-category-tabs`).addEventListener('click', event => {
      const category = event.target.closest('[data-category]')?.dataset.category;
      if (category) switchCategory(view, category);
    });
  });
  $('#form-category').addEventListener('click', event => {
    const category = event.target.closest('[data-category]')?.dataset.category;
    if (category && state.modal.mode === 'add') {
      state.modal.category = category;
      refreshFormOptions();
    }
  });
  $('.primary-tabs').addEventListener('click', event => {
    const tab = event.target.closest('[data-tab]')?.dataset.tab;
    if (tab) changeTab(tab);
  });
  $('#discover-users').addEventListener('click', event => {
    const uid = event.target.closest('[data-user]')?.dataset.user;
    if (uid) selectUser(uid);
  });
  $('#discover-back').addEventListener('click', () => {
    state.selectedUserId = null;
    $('#discover-list-panel').hidden = true;
    $('#discover-users-panel').hidden = false;
  });
  $('#mine-cards').addEventListener('click', event => {
    const edit = event.target.closest('[data-edit]')?.dataset.edit;
    const ate = event.target.closest('[data-ate]')?.dataset.ate;
    if (edit) {
      const entry = state.mine.find(item => item.id === edit);
      if (entry) openModal('edit', entry);
    }
    if (ate) void markAsEaten(ate);
  });
  $('#discover-cards').addEventListener('click', event => {
    const id = event.target.closest('[data-copy]')?.dataset.copy;
    if (id) void copyFromUser(id);
  });
  $('#add-button').addEventListener('click', () => { playTap(); openModal('add'); });
  $('#modal-close').addEventListener('click', () => $('#entry-modal').close());
  $('#entry-modal').addEventListener('click', event => {
    if (event.target === $('#entry-modal')) $('#entry-modal').close();
  });
  $('#form-status').addEventListener('click', event => {
    const status = event.target.closest('[data-status]')?.dataset.status;
    if (!status) return;
    state.modal.status = status;
    if (status !== 'eaten') state.modal.rating = null;
    refreshFormOptions();
  });
  $('#form-rating').addEventListener('click', event => {
    const rating = event.target.closest('[data-rating]')?.dataset.rating;
    if (!rating) return;
    state.modal.rating = state.modal.rating === rating ? null : rating;
    refreshFormOptions();
  });
  ['price', 'style'].forEach(group => {
    $(`#form-${group}-tags`).addEventListener('click', event => {
      const tag = event.target.closest('[data-tag]')?.dataset.tag;
      if (!tag) return;
      if (state.modal.tags.has(tag)) state.modal.tags.delete(tag);
      else {
        if (group === 'price') TAG_GROUPS.price.forEach(value => state.modal.tags.delete(value));
        state.modal.tags.add(tag);
      }
      playTap(); refreshFormOptions();
    });
  });
  $('#add-dish').addEventListener('click', addDish);
  $('#dish-input').addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); addDish(); }
  });
  $('#dish-list').addEventListener('click', event => {
    const button = event.target.closest('[data-remove-dish]');
    if (!button) return;
    state.modal.dishes.splice(Number(button.dataset.removeDish), 1);
    refreshFormOptions();
  });
  $('#entry-form').addEventListener('submit', saveModal);
  $('#delete-entry').addEventListener('click', deleteModalEntry);
  $('#sound-toggle').addEventListener('click', () => { toggleSound(); updateSoundButton(); });
  $("#account-button").addEventListener("click", () => {
    const isOpen = $("#account-menu").classList.contains("is-open");
    setAccountMenuOpen(!isOpen);
  });
  document.addEventListener('click', event => {
    // Đóng dropdown khi bấm ra ngoài, tương tự menu tài khoản.
    if (!event.target.closest('[data-district-dropdown]')) {
      document.querySelectorAll('[data-district-dropdown].is-open').forEach(dropdown => {
        setDistrictDropdownOpen(dropdown, false);
      });
    }
    if (!event.target.closest(".account-area")) {
      setAccountMenuOpen(false);
    }
  });
  $('#logout-button').addEventListener('click', async () => {
    try { await logout(); } catch (error) { toast(messageFor(error), true); }
  });
  document.addEventListener("keydown", (event) => {
    if (
      event.key === "Escape" &&
      $("#account-menu").classList.contains("is-open")
    ) {
      setAccountMenuOpen(false);
      $("#account-button").focus();
    }
  });
}
function updateSoundButton() {
  const enabled = isSoundEnabled();
  const button = $("#sound-toggle");

  button.classList.toggle("is-muted", !enabled);
  button.setAttribute(
    "aria-label",
    enabled ? "Tắt âm thanh tap" : "Bật âm thanh tap",
  );
  button.setAttribute("aria-pressed", String(enabled));

  $("#sound-state").textContent = enabled ? "Bật" : "Tắt";
}

bindEvents();
updateSoundButton();
watchAppAuth(user => {
  state.user = user;
  const name = user.displayName || user.email?.split('@')[0] || 'Bạn';
  $('#header-avatar').outerHTML = avatar({ ...user, displayName: name }, true).replace('class="avatar avatar-small"', 'id="header-avatar" class="avatar avatar-small"');
  $('#account-name').textContent = name;
  void loadMine();
});
