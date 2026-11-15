# AgentDock (hướng dẫn tiếng Việt)

AgentDock đưa các coding agent trên máy bạn vào side panel của trình duyệt, với bố cục giống panel Claude in Chrome. Mỗi cuộc chat chọn một agent: Claude Code, Codex, OpenCode, Gemini CLI, Qwen Code, hoặc agent ACP bất kỳ bạn tự khai báo. Mọi thứ chạy trên máy và dùng tài khoản sẵn có của từng agent.

Bản tiếng Anh đầy đủ hơn ở [guide.md](guide.md).

## Cài đặt

Cần Node 20 trở lên và ít nhất một agent đã cài và đã đăng nhập (chạy agent đó một lần trong Terminal).

```sh
npm install
npm run setup
```

Sau đó mở `chrome://extensions`, bật **Developer mode**, bấm **Load unpacked** rồi chọn thư mục `extension/`. Bấm icon trên thanh công cụ để mở panel.

`npm run setup` làm các việc sau:

- build extension;
- đăng ký native host cho Chrome, Brave, Edge, Arc, Vivaldi, Chromium;
- cài daemon chạy nền;
- gỡ bản cũ `com.claude.sidepanel` nếu còn.

Gỡ cài đặt: chạy `npm run uninstall`, rồi xoá extension trong trình duyệt.

## Dùng

- Chọn agent, chế độ quyền và model ngay trong ô soạn. Thư mục làm việc chọn ở dòng phía trên ô soạn, trước tin nhắn đầu tiên.
- **Enter** để gửi, **Shift+Enter** để xuống dòng. Khi bộ gõ tiếng Việt còn đang ghép chữ thì Enter không gửi.
- Gõ **/** để xem lệnh và skill của agent. `/new` mở chat mới, `/resume` mở Lịch sử.
- **Shift+Tab** đổi chế độ quyền, **Esc** để dừng, **Ctrl/⌘+N** mở chat mới.
- Đóng panel không làm dừng phiên. Mở lại panel là thấy tiếp.
- **Lịch sử** hiện các chat đang chạy, phiên Claude Code và Codex cũ (kể cả phiên mở từ Terminal), và các phiên ACP đã mở bằng AgentDock.
- **Cài đặt** chỉnh ngôn ngữ (Tiếng Việt, English hoặc theo trình duyệt), giao diện sáng/tối và agent mặc định.

## Thêm agent riêng

Tạo file `~/.agentdock/agents.json`:

```json
[{ "id": "goose", "name": "Goose", "command": ["goose", "acp"] }]
```

## Khi có lỗi

- **Panel báo chưa cài phần chạy trên máy:** chạy `npm run setup`, rồi reload extension.
- **Agent bị mờ, không chọn được:** lệnh của agent không có trong PATH. Cài agent rồi chạy lại `npm run setup`.
- **Agent đòi đăng nhập:** chạy lệnh đăng nhập ghi trong mục Cài đặt.
- **Log:** `~/.agentdock/daemon.log`.
