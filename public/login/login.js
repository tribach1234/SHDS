const container = document.querySelector('.container');
const registerBtn = document.querySelector('.register-btn');
const loginBtn = document.querySelector('.login-btn');

// Chuyển đổi giữa Form Đăng nhập & Đăng ký
registerBtn.addEventListener('click', () => {
    container.classList.add('active');
    clearErrors();
});

loginBtn.addEventListener('click', () => {
    container.classList.remove('active');
    clearErrors();
});

// --- XỬ LÝ CHUYỂN ĐỔI ICON MẬT KHẨU ---
document.querySelectorAll('.password-icon').forEach(icon => {
    const input = icon.parentElement.querySelector('input');

    // 1. Khi nhập dữ liệu
    input.addEventListener('input', () => {
        if (input.value.length > 0) {
            if (input.type === 'password') {
                icon.className = 'fa-solid fa-eye password-icon active';
            } else {
                icon.className = 'fa-solid fa-eye-slash password-icon active';
            }
        } else {
            input.type = 'password';
            icon.className = 'fa-solid fa-lock password-icon';
        }
    });

    // 2. Khi nhấp vào Icon
    icon.addEventListener('click', () => {
        if (input.value.length === 0) return;

        if (input.type === 'password') {
            input.type = 'text';
            icon.className = 'fa-solid fa-eye-slash password-icon active';
        } else {
            input.type = 'password';
            icon.className = 'fa-solid fa-eye password-icon active';
        }
    });
});

// Hàm hiển thị Toast Notification
let toastTimeout;
function showToast(message, type = 'error') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast-notification ${type} show`;

    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
        toast.classList.remove('show');
    }, 4000);
}

// Hàm kích hoạt Lỗi + Rung cho toàn bộ khung
function triggerInputError(inputElement) {
    const inputBox = inputElement.parentElement;
    inputBox.classList.remove('input-error-box');
    void inputBox.offsetWidth; // Reflow animation
    inputBox.classList.add('input-error-box');
}

// Hàm xóa trạng thái lỗi
function clearErrors() {
    document.querySelectorAll('.input-box').forEach(box => {
        box.classList.remove('input-error-box');
    });
}

// Tự động xóa trạng thái lỗi khi bắt đầu nhập lại
document.querySelectorAll('.input-box input').forEach(input => {
    input.addEventListener('input', () => {
        input.parentElement.classList.remove('input-error-box');
    });
});

// Hàm kiểm tra định dạng Email chuẩn
function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(String(email).toLowerCase());
}

// Reset lại icon về mặc định
function resetPasswordIcons() {
    document.querySelectorAll('.password-icon').forEach(icon => {
        icon.className = 'fa-solid fa-lock password-icon';
        const input = icon.parentElement.querySelector('input');
        if (input) input.type = 'password';
    });
}

// --- XỬ LÝ ĐĂNG KÝ (GỬI SERVER) ---
const registerForm = document.getElementById('registerForm');
registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const nameInput = document.getElementById('regName');
    const emailInput = document.getElementById('regEmail');
    const passwordInput = document.getElementById('regPassword');
    const confirmPasswordInput = document.getElementById('regConfirmPassword');

    const fullName = nameInput.value.trim();
    const email = emailInput.value.trim();
    const pass = passwordInput.value;
    const confirmPassword = confirmPasswordInput.value;

    let hasError = false;

    if (fullName.length < 3) {
        triggerInputError(nameInput);
        if (!hasError) showToast("Tên của bạn quá ngắn (tối thiểu 3 ký tự)", "error");
        hasError = true;
    }

    if (!validateEmail(email)) {
        triggerInputError(emailInput);
        if (!hasError) showToast("Email không hợp lệ", "error");
        hasError = true;
    }

    if (pass.length < 6) {
        triggerInputError(passwordInput);
        if (!hasError) showToast("Mật khẩu không đủ mạnh (tối thiểu 6 ký tự)", "error");
        hasError = true;
    }

    if (pass !== confirmPassword || confirmPassword === '') {
        triggerInputError(confirmPasswordInput);
        if (!hasError) showToast("Mật khẩu xác nhận không khớp", "error");
        hasError = true;
    }

    if (hasError) return;

    // Gửi Request lên Server Express
    const submitBtn = registerForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Đang xử lý...';

    try {
        const response = await fetch('/api/register-admin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fullName, email, pass })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            showToast(data.message, "success");
            registerForm.reset();
            clearErrors();
            resetPasswordIcons();
        } else {
            showToast(data.message || "Đăng ký thất bại!", "error");
            if (data.message && data.message.includes("Email")) {
                triggerInputError(emailInput);
            }
        }
    } catch (err) {
        showToast("Lỗi kết nối máy chủ! Vui lòng thử lại sau.", "error");
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Đăng ký';
    }
});

// --- XỬ LÝ ĐĂNG NHẬP (GỬI SERVER) ---
const loginForm = document.getElementById('loginForm');
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const emailInput = document.getElementById('loginEmail');
    const passwordInput = document.getElementById('loginPassword');

    const email = emailInput.value.trim();
    const pass = passwordInput.value;

    let hasError = false;

    if (!validateEmail(email)) {
        triggerInputError(emailInput);
        if (!hasError) showToast("Email không hợp lệ", "error");
        hasError = true;
    }

    if (pass.length < 6) {
        triggerInputError(passwordInput);
        if (!hasError) showToast("Mật khẩu không đủ mạnh", "error");
        hasError = true;
    }

    if (hasError) return;

    // Gửi Request lên Server Express
    const submitBtn = loginForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Đang xử lý...';

    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, pass })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            showToast(`Chào mừng ${data.user.fullName}`, "success");
            loginForm.reset();
            clearErrors();
            resetPasswordIcons();

            // Chuyển hướng sau khi đăng nhập thành công
            setTimeout(() => {
                window.location.href = '/';
            }, 1500);
        } else {
            showToast(data.message || "Đăng nhập thất bại!", "error");
            triggerInputError(emailInput);
            triggerInputError(passwordInput);
        }
    } catch (err) {
        showToast("Lỗi kết nối máy chủ! Vui lòng thử lại sau.", "error");
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Đăng nhập';
    }
});