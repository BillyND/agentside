// Grants this extension microphone access, which the side panel cannot request itself.
const vi = navigator.language.toLowerCase().startsWith("vi");
const text = {
  ok: vi ? ["Đã cho phép micro", "Bạn có thể đóng tab này và nói trong side panel."] : ["Microphone allowed", "You can close this tab and dictate in the side panel."],
  no: vi ? ["Micro bị chặn", "Mở cài đặt trang (biểu tượng ổ khoá) để cho phép micro, rồi tải lại tab này."] : ["Microphone blocked", "Allow the microphone in this page's site settings (lock icon), then reload this tab."],
};
const show = ([title, body]) => {
  document.getElementById("title").textContent = title;
  document.getElementById("body").textContent = body;
};
if (vi) show(["Cho phép dùng micro", "Chọn “Cho phép” trong hộp thoại của trình duyệt để nhập bằng giọng nói trong side panel."]);
navigator.mediaDevices
  .getUserMedia({ audio: true })
  .then((stream) => {
    stream.getTracks().forEach((t) => t.stop());
    show(text.ok);
    setTimeout(() => window.close(), 1500);
  })
  .catch(() => show(text.no));
