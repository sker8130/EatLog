import { db } from './firebase-init.js';
import {
  collection, doc, getDocs, query, where, setDoc, deleteDoc,
  runTransaction, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';

// Bốn danh mục mới dùng chung hạ tầng cũ; bản ghi cũ không có category = quán ăn.
const CATEGORIES = ['restaurant', 'outing', 'snack', 'cafe', 'matcha'];
const PRICE_TAGS = ['Ăn giàu', 'Ăn vừa túi', 'Ăn nghèo'];
const STYLE_TAGS = ['Ăn nhẹ', 'Ăn no', 'Ăn nhậu', 'Buffet'];
const categoryOf = value => CATEGORIES.includes(value) ? value : 'restaurant';
const normalize = value => String(value ?? '').normalize('NFKC').trim()
  .replace(/\s+/g, ' ').toLocaleLowerCase('vi');
const clean = value => String(value ?? '').trim().replace(/\s+/g, ' ');
const rows = snapshot => snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
const byNewest = (a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0);

// Giữ nguyên ID cũ cho quán ăn; thêm prefix riêng cho 4 loại địa điểm mới.
async function placeIdFor(category, name, district) {
  const text = `${normalize(name)}\u0000${normalize(district)}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  return category === 'restaurant' ? `r_${hash}` : `p_${category}_${hash}`;
}
const entryIdFor = (uid, placeId) => `${uid}_${placeId}`;

function personalFields(category, input) {
  const note = String(input.note ?? '').trim();
  if (category !== 'restaurant') return { note };
  const status = input.status === 'eaten' ? 'eaten' : 'want_to_try';
  const tags = Array.isArray(input.tags) ? input.tags : [];
  const price = PRICE_TAGS.find(tag => tags.includes(tag));
  return {
    status,
    rating: status === 'eaten' && ['good', 'ok', 'bad'].includes(input.rating) ? input.rating : null,
    tags: [...(price ? [price] : []), ...STYLE_TAGS.filter(tag => tags.includes(tag))],
    dishes: [...new Set((Array.isArray(input.dishes) ? input.dishes : []).map(clean).filter(Boolean))],
    note
  };
}

export async function saveUserProfile(user) {
  await setDoc(doc(db, 'users', user.uid), {
    displayName: clean(user.displayName) || user.email?.split('@')[0] || 'Người dùng',
    email: user.email || '', photoURL: user.photoURL || '', updatedAt: serverTimestamp()
  }, { merge: true });
}

export async function getMyEntries(uid) {
  const snapshot = await getDocs(query(collection(db, 'entries'), where('userId', '==', uid)));
  return rows(snapshot).sort(byNewest);
}

export async function getDiscoverData() {
  const [userDocs, entryDocs] = await Promise.all([
    getDocs(collection(db, 'users')), getDocs(collection(db, 'entries'))
  ]);
  return { users: rows(userDocs), entries: rows(entryDocs).sort(byNewest) };
}

export async function addPlaceWithEntry(uid, input) {
  const name = clean(input.name);
  const district = clean(input.district);
  if (!name || !district) throw new Error('Vui lòng nhập tên địa điểm và quận / huyện.');
  const category = categoryOf(input.category);
  const placeId = await placeIdFor(category, name, district);
  // Giữ tên collection restaurants cho dữ liệu dùng chung để không phải chuyển dữ liệu cũ.
  const placeRef = doc(db, 'restaurants', placeId);
  const entryRef = doc(db, 'entries', entryIdFor(uid, placeId));

  return runTransaction(db, async transaction => {
    const [placeSnap, entrySnap] = await Promise.all([
      transaction.get(placeRef), transaction.get(entryRef)
    ]);
    if (entrySnap.exists()) return { alreadyExists: true };
    const place = placeSnap.exists() ? placeSnap.data() : {
      name, district, address: clean(input.address), category, addedBy: uid,
      createdAt: serverTimestamp()
    };
    if (!placeSnap.exists()) transaction.set(placeRef, place);
    transaction.set(entryRef, {
      userId: uid, restaurantId: placeId,
      restaurantName: place.name, restaurantDistrict: place.district,
      restaurantAddress: place.address || clean(input.address), restaurantCategory: category,
      ...personalFields(category, input), addedFrom: null,
      createdAt: serverTimestamp(), updatedAt: serverTimestamp()
    });
    return { alreadyExists: false };
  });
}

export async function updateMyEntry(uid, entryId, input) {
  const ref = doc(db, 'entries', entryId);
  return runTransaction(db, async transaction => {
    const snap = await transaction.get(ref);
    if (!snap.exists() || snap.data().userId !== uid) {
      throw new Error('Không tìm thấy địa điểm trong danh sách của bạn.');
    }
    // Danh mục lưu cố định theo entry, không thể tráo loại qua payload.
    const category = categoryOf(snap.data().restaurantCategory);
    transaction.update(ref, { ...personalFields(category, input), updatedAt: serverTimestamp() });
  });
}

export async function deleteMyEntry(uid, entryId) {
  if (!entryId.startsWith(`${uid}_`)) throw new Error('Bạn không có quyền xoá mục này.');
  await deleteDoc(doc(db, 'entries', entryId));
}

export async function addFromAnotherList(uid, sourceEntryId, sourceUserId) {
  const sourceRef = doc(db, 'entries', sourceEntryId);
  return runTransaction(db, async transaction => {
    const sourceSnap = await transaction.get(sourceRef);
    if (!sourceSnap.exists() || sourceSnap.data().userId !== sourceUserId || sourceUserId === uid) {
      throw new Error('Địa điểm này không còn khả dụng.');
    }
    const source = sourceSnap.data();
    const category = categoryOf(source.restaurantCategory);
    const targetRef = doc(db, 'entries', entryIdFor(uid, source.restaurantId));
    const targetSnap = await transaction.get(targetRef);
    if (targetSnap.exists()) return { alreadyExists: true };
    const personal = category === 'restaurant'
      ? { status: 'want_to_try', rating: null,
          tags: Array.isArray(source.tags) ? source.tags : [],
          dishes: Array.isArray(source.dishes) ? source.dishes : [], note: '' }
      : { note: '' };
    transaction.set(targetRef, {
      userId: uid, restaurantId: source.restaurantId,
      restaurantName: source.restaurantName, restaurantDistrict: source.restaurantDistrict,
      restaurantAddress: source.restaurantAddress || '', restaurantCategory: category,
      ...personal, addedFrom: sourceUserId,
      createdAt: serverTimestamp(), updatedAt: serverTimestamp()
    });
    return { alreadyExists: false };
  });
}
