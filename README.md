# EatLog

**Một cuốn sổ nhỏ để ghi những chỗ đáng ghé.**

EatLog là web app cá nhân để lưu quán ăn, địa điểm đi chơi, quán ăn vặt, cafe và matcha. Bạn có thể tự ghi chú địa điểm đã lưu, xem danh sách của người dùng khác và thêm một địa điểm từ danh sách của họ vào sổ của mình.

Thiết kế theo cảm hứng **vé giấy / sổ tay ẩm thực** với nền xanh rêu đậm, giấy kem và điểm nhấn vàng nghệ; giao diện tiếng Việt, ưu tiên điện thoại.

> Dự án demo cá nhân. Website dùng Firebase Authentication và Cloud Firestore; không có backend tự viết, không dùng Firebase Storage.

## Danh mục & tính năng

| Danh mục | Thông tin lưu | Tùy chọn riêng |
| --- | --- | --- |
| **Quán ăn** | Tên, quận/huyện, địa chỉ (tùy chọn), ghi chú | Trạng thái **Chưa thử / Đã ăn**, đánh giá **Ngon / Ổn / Đã ăn mà dở**, món ăn và tag |
| **Đi chơi** | Tên, quận/huyện, địa chỉ (tùy chọn), ghi chú | Không cần trạng thái, đánh giá, tag hay danh sách món |
| **Ăn vặt** | Tên, quận/huyện, địa chỉ (tùy chọn), ghi chú | Như trên |
| **Cafe** | Tên, quận/huyện, địa chỉ (tùy chọn), ghi chú | Như trên |
| **Matcha Map** | Tên, quận/huyện, địa chỉ (tùy chọn), ghi chú | Như trên |

**Riêng Quán ăn** có hai nhóm tag:

- **Mức chi:** `Ăn giàu`, `Ăn vừa túi`, `Ăn nghèo` (tối đa một tag).
- **Kiểu ăn:** `Ăn vặt`, `Ăn no`, `Ăn nhậu`, `Buffet` (có thể chọn nhiều).

Các chức năng chính:

- Đăng ký, đăng nhập bằng email/mật khẩu hoặc Google; đăng xuất qua menu avatar.
- **List của tôi:** thêm, sửa, xóa địa điểm và tìm kiếm/lọc theo danh mục, quận. Riêng Quán ăn có thêm bộ lọc trạng thái, tag, đánh giá và nút **Đã ăn rồi**.
- **Khám phá:** xem danh sách người dùng khác, đọc cảm nhận và thêm địa điểm từ sổ của họ vào sổ của mình (không tạo trùng entry).
- Âm thanh tap tạo bằng Web Audio API, có thể bật/tắt trong menu avatar; lựa chọn được lưu trên trình duyệt.
- Giao diện responsive, trạng thái loading/rỗng, thông báo toast và modal thêm/sửa.

## Công nghệ

- **HTML5, CSS3, JavaScript (ES modules)** — không framework.
- **Firebase JavaScript SDK 10.13.0 (CDN)**.
- **Firebase Authentication** — Email/Password và Google popup.
- **Cloud Firestore** — lưu dữ liệu dùng chung và ghi chú riêng của từng tài khoản.
- **Firebase Hosting** — phát hành website tĩnh qua HTTPS.
- **Google Fonts:** Fraunces cho logo/tiêu đề, Inter cho nội dung.

## Cấu trúc dự án

```text
EatLog/
├── index.html           # Đăng nhập / đăng ký
├── app.html             # Giao diện sổ tay sau khi đăng nhập
├── style.css            # Giao diện chung, responsive
├── firebase-init.js     # Khởi tạo Firebase, xuất auth và db
├── auth.js              # Xác thực và điều hướng
├── firestore.js         # Đọc/ghi dữ liệu Firestore; không thao tác DOM
├── app.js               # Giao diện, modal, bộ lọc, sự kiện
├── sound.js             # Âm thanh tap bằng Web Audio API
├── firestore.rules      # Quy tắc truy cập Firestore
├── firebase.json        # Cấu hình Firebase Hosting (nếu đã thiết lập)
├── .firebaserc          # Project Firebase mặc định (nếu đã thiết lập)
├── favicon.ico          # Favicon (nếu có)
├── favicon.png          # Favicon PNG (nếu có)
├── apple-touch-icon.png # Icon trên thiết bị Apple (nếu có)
├── .gitignore
└── README.md
```

Các biểu tượng danh mục được vẽ bằng SVG ngay trong mã nguồn; Matcha Map **cho đẹp =))** `assets/matcha-ico.png`.

## Chạy trên máy (local)

1. Tải hoặc clone repository.
2. Chạy một trong hai lệnh:

   ```bash
   python -m http.server 8000
   # Hoặc trên một số máy Windows:
   py -m http.server 8000
   ```

3. Mở [http://localhost:8000](http://localhost:8000).

> **Chú ý:** Môi trường localhost vẫn kết nối đến Firestore của project đang khai báo trong `firebase-init.js`. Các thao tác thêm/sửa/xóa lúc debug sẽ tác động dữ liệu thật nếu bạn chưa sử dụng project Firebase riêng để thử nghiệm.

## Thiết lập Firebase

Ứng dụng đang được viết cho Firebase project **`eatlog-086`**. Nếu sử dụng project khác, cập nhật cấu hình trong `firebase-init.js`.

1. Vào [Firebase Console](https://console.firebase.google.com/), chọn project.
2. Trong **Authentication → Sign-in method**, bật **Email/Password** và **Google**.
3. Trong **Authentication → Settings → Authorized domains**, cho phép tên miền bạn dùng để đăng nhập (ví dụ `localhost` và tên miền Hosting).
4. Tạo **Cloud Firestore** nếu chưa có.
5. Dán nội dung `firestore.rules` vào **Firestore Database → Rules** và **Publish**.

Firebase web config dùng trong JavaScript phía trình duyệt không phải khóa quản trị. **Không đưa service account JSON, private key, access token hoặc mật khẩu vào repository.**

## Mô hình dữ liệu Firestore

```text
users/{uid}
  displayName, email, photoURL, updatedAt

restaurants/{placeId}
  name, address, district, category, addedBy, createdAt

entries/{uid}_{placeId}
  userId, restaurantId, restaurantName, restaurantDistrict,
  restaurantAddress, restaurantCategory,
  note, addedFrom, createdAt, updatedAt
  # Với Quán ăn còn có: status, rating, tags, dishes
```

- `restaurants` là collection **địa điểm dùng chung** (giữ tên cũ để tương thích dữ liệu).
- `entries` là phần **mỗi tài khoản tự lưu**, không nhân bản toàn bộ thông tin địa điểm.
- ID địa điểm được tạo từ danh mục + tên + quận đã chuẩn hóa; một người chỉ có một entry cho mỗi địa điểm.
- Dữ liệu Quán ăn cũ không có trường `category`/`restaurantCategory` được hiểu là danh mục **Quán ăn**.
- Người dùng đã đăng nhập có thể đọc danh sách người khác ở tab Khám phá; chỉ chủ entry mới được sửa hoặc xóa entry của mình, theo Firestore Rules.

## Deploy lên Firebase Hosting

Cài [Firebase CLI](https://firebase.google.com/docs/cli), đăng nhập và kiểm tra `firebase.json` trỏ đến Hosting site bạn đã tạo:

```json
{
  "hosting": {
    "site": "eatlog-086",
    "public": ".",
    "ignore": [
      "firebase.json", ".firebaserc", "firestore.rules",
      "**/.*", "**/node_modules/**", "*.zip", "*.md"
    ]
  }
}
```

Nếu Hosting site thực tế có ID khác, thay giá trị `site` cho đúng. Chạy từ thư mục gốc của dự án:

```bash
firebase login
firebase deploy --only hosting --project eatlog-086
```

Địa chỉ mặc định sau khi deploy thành công với site `eatlog-086`:

**https://eatlog-086.web.app**

Lệnh `--only hosting` chỉ cập nhật file website; **không tự triển khai thay đổi trong `firestore.rules`**. Nếu chỉnh rules, publish riêng trong Firebase Console hoặc deploy rules có chủ đích.

## Quy trình cập nhật

1. Sửa code và test tại `localhost:8000`.
2. Commit phiên bản đã kiểm tra lên GitHub.
3. Deploy Hosting khi sẵn sàng cho mọi người sử dụng:

   ```bash
   firebase deploy --only hosting --project eatlog-086
   ```