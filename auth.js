import { auth, googleProvider } from './firebase-init.js';
import { saveUserProfile } from './firestore.js';
import {
  onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signInWithPopup, updateProfile, signOut
} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js';

const authMessages = {
  'auth/invalid-email': 'Địa chỉ email chưa đúng định dạng.',
  'auth/invalid-credential': 'Email hoặc mật khẩu không đúng.',
  'auth/wrong-password': 'Mật khẩu không đúng.',
  'auth/user-not-found': 'Không tìm thấy tài khoản với email này.',
  'auth/email-already-in-use': 'Email này đã được đăng ký. Hãy đăng nhập nhé.',
  'auth/weak-password': 'Mật khẩu cần có ít nhất 6 ký tự.',
  'auth/missing-password': 'Vui lòng nhập mật khẩu.',
  'auth/popup-closed-by-user': 'Bạn đã đóng cửa sổ đăng nhập Google.',
  'auth/cancelled-popup-request': 'Yêu cầu đăng nhập Google đã bị huỷ.',
  'auth/popup-blocked': 'Trình duyệt đã chặn cửa sổ Google. Hãy cho phép popup.',
  'auth/unauthorized-domain': 'Tên miền này chưa được cho phép trong Firebase Authentication.',
  'auth/operation-not-allowed': 'Phương thức đăng nhập này chưa được bật trong Firebase.',
  'auth/account-exists-with-different-credential': 'Email này đã dùng phương thức đăng nhập khác.',
  'auth/too-many-requests': 'Đã thử quá nhiều lần. Vui lòng thử lại sau.',
  'auth/network-request-failed': 'Không thể kết nối mạng. Vui lòng kiểm tra kết nối.'
};
export function friendlyError(error) {
  if (authMessages[error?.code]) return authMessages[error.code];
  if (error?.message && !error.message.startsWith('Firebase:')) return error.message;
  return 'Có lỗi xảy ra. Vui lòng thử lại.';
}

export function watchAppAuth(onReady) {
  return onAuthStateChanged(auth, async user => {
    if (!user) { location.replace('./index.html'); return; }
    // Việc đồng bộ hồ sơ không được chặn tải danh sách khi mạng tạm lỗi.
    try { await saveUserProfile(user); } catch (error) { console.warn('Không thể đồng bộ hồ sơ:', error); }
    onReady(user);
  });
}

export async function logout() { await signOut(auth); }

if (document.body.dataset.page === 'auth') {
  const form = document.querySelector('#auth-form');
  const title = document.querySelector('#auth-title');
  const subtitle = document.querySelector('#auth-subtitle');
  const nameRow = document.querySelector('#name-row');
  const toggle = document.querySelector('#auth-toggle');
  const submitButton = document.querySelector('#auth-submit');
  const googleButton = document.querySelector('#google-login');
  const errorBox = document.querySelector('#auth-error');
  let signingUp = false;
  let submitting = false;

  function setMode(register) {
    signingUp = register;
    title.textContent = register ? 'Tạo sổ tay mới' : 'Mừng bạn trở lại';
    subtitle.textContent = register ? 'Đăng ký để bắt đầu lưu những quán ngon.' : 'Đăng nhập để mở cuốn sổ quán ăn của bạn.';
    nameRow.hidden = !register;
    document.querySelector('#display-name').required = register;
    submitButton.textContent = register ? 'Tạo tài khoản' : 'Đăng nhập';
    toggle.textContent = register ? 'Đã có tài khoản? Đăng nhập' : 'Chưa có tài khoản? Đăng ký';
    errorBox.hidden = true;
  }
  function busy(value) {
    submitting = value;
    submitButton.disabled = value;
    googleButton.disabled = value;
    toggle.disabled = value;
  }
  function goToApp() { location.replace('./app.html'); }
  toggle.addEventListener('click', () => setMode(!signingUp));

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (submitting) return;
    errorBox.hidden = true;
    const email = document.querySelector('#email').value.trim();
    const password = document.querySelector('#password').value;
    const displayName = document.querySelector('#display-name').value.trim();
    if (signingUp && !displayName) {
      errorBox.textContent = 'Vui lòng nhập tên hiển thị.';
      errorBox.hidden = false;
      return;
    }
    if (signingUp && password.length < 6) {
      errorBox.textContent = 'Mật khẩu cần có ít nhất 6 ký tự.';
      errorBox.hidden = false;
      return;
    }
    busy(true);
    try {
      if (signingUp) {
        const result = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(result.user, { displayName });
        await saveUserProfile(result.user);
      } else {
        const result = await signInWithEmailAndPassword(auth, email, password);
        await saveUserProfile(result.user);
      }
      goToApp();
    } catch (error) {
      errorBox.textContent = friendlyError(error);
      errorBox.hidden = false;
    } finally { busy(false); }
  });

  googleButton.addEventListener('click', async () => {
    if (submitting) return;
    errorBox.hidden = true;
    busy(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      await saveUserProfile(result.user);
      goToApp();
    } catch (error) {
      errorBox.textContent = friendlyError(error);
      errorBox.hidden = false;
    } finally { busy(false); }
  });

  onAuthStateChanged(auth, user => {
    if (user && !submitting) goToApp();
    else if (!user) document.querySelector('#auth-loading').hidden = true;
  });
}
