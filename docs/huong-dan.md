# Claude Side Panel

Extension Chrome mở Claude Code ngay trong side panel, giao diện chat kiểu Claude Desktop. Mọi thứ chạy trên máy bạn và dùng tài khoản `claude` bạn đã đăng nhập.

## Cài đặt

Cần Node 20+ và Claude Code CLI đã đăng nhập (`claude` chạy được trong Terminal).

```sh
cd claude-sidepanel
npm install
npm run setup
```

`npm run setup` làm ba việc:

- chép thư viện hiển thị vào `extension/lib`;
- đăng ký native host `com.claude.sidepanel` cho Chrome, và chỉ extension có ID `piimgbbljhhmfaailkojmkhkbdbcdlhp` mới gọi được;
- cài daemon dưới dạng LaunchAgent (`~/Library/LaunchAgents/com.claude.sidepanel.daemon.plist`), tự chạy khi đăng nhập.

Sau đó mở `chrome://extensions`, bật Developer mode, chọn **Load unpacked** rồi trỏ tới thư mục `extension/`. Bấm icon extension là side panel mở ra.

Gỡ: `npm run uninstall`, rồi xoá extension trong Chrome.

## Dùng

- Chọn thư mục làm việc ở màn hình chào rồi gõ câu hỏi. Enter để gửi, Shift+Enter để xuống dòng.
- Gõ `/` để xem mọi lệnh và skill mà phiên Claude Code đang có (`/compact`, `/context`, skill trong `~/.claude`…).
- Các lệnh cần menu trong CLI được làm thành nút: `/model` và ô Model, `/mode` hoặc Shift+Tab để đổi chế độ quyền, `/resume` hoặc bấm tiêu đề để mở chat cũ, `/new` hoặc Ctrl+N để mở chat mới, Esc để dừng.
- Khi Claude cần quyền, khung duyệt hiện ra với các nút Cho phép, Luôn cho phép và Từ chối. Câu hỏi nhiều lựa chọn của Claude cũng hiện thành nút bấm.
- Đóng side panel không làm dừng phiên. Mở lại là thấy tiếp.

Lệnh chỉ có trong giao diện terminal (ví dụ `/config`) không dùng được ở đây.

## Cách hoạt động

```
side panel (extension)
   │ chrome.runtime.connectNative
native-host.mjs   ← Chrome mở mỗi lần panel mở, chỉ chuyển tiếp tin nhắn
   │ Unix socket ~/.claude-sidepanel/daemon.sock (quyền 0600)
daemon.mjs        ← launchd giữ chạy, sở hữu các phiên Claude Agent SDK
   │
claude (CLI của bạn)
```

- Không mở cổng mạng nào. Trang web không gọi được vào daemon.
- Daemon chạy dưới launchd, không nằm trong cây tiến trình của Chrome, nên phiên sống qua việc đóng panel và `claude` không bị dính cờ quarantine của Chrome.
- Lịch sử chat là transcript của Claude Code trong `~/.claude/projects`, nên chat mở trong panel cũng resume được từ CLI và ngược lại.

## Khi có lỗi

- Panel báo "Chưa cài phần chạy trên máy": chạy lại `npm run setup`.
- Log daemon: `~/.claude-sidepanel/daemon.log`.
- Khởi động lại daemon: `launchctl kickstart -k gui/$(id -u)/com.claude.sidepanel.daemon`.
- Sau khi `git pull` hoặc đổi phiên bản Node, chạy lại `npm run setup`.
