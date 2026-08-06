// Login.js — Handles login and register form submissions via API

const container = document.querySelector('.container');
const registerBtn = document.querySelector('.register-btn');
const loginBtn = document.querySelector('.login-btn');

// Toggle between Login and Register panels
registerBtn.addEventListener('click', () => {
    container.classList.add('active');
});

loginBtn.addEventListener('click', () => {
    container.classList.remove('active');
});

// ── Login Form ────────────────────────────────────────────────────
const loginForm = document.getElementById('loginForm');
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = document.getElementById('loginEmail').value.trim();
    const pass = document.getElementById('loginPass').value;

    if (!email || !pass) {
        return alert('Vui lòng nhập Email và Mật khẩu!');
    }

    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, pass }),
        });
        const data = await res.json();

        if (!data.success) {
            return alert(data.message || 'Đăng nhập thất bại!');
        }

        // Save user info for the Student page to pick up
        localStorage.setItem('studentId', data.user.email);
        localStorage.setItem('fullName', data.user.fullName);
        localStorage.setItem('role', data.user.role);

        // Redirect based on role
        if (data.user.role === 'STUDENT') {
            window.location.href = `/Student/Student.html?studentId=${encodeURIComponent(data.user.email)}`;
        } else {
            alert(`Đăng nhập thành công! Vai trò: ${data.user.role}`);
        }
    } catch (err) {
        alert('Lỗi kết nối server: ' + err.message);
    }
});

// ── Register Form (Admin only) ────────────────────────────
const registerForm = document.getElementById('registerForm');
registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const fullName = document.getElementById('registerName').value.trim();
    const email = document.getElementById('registerEmail').value.trim();
    const pass = document.getElementById('registerPass').value;

    if (!fullName || !email || !pass) {
        return alert('Vui lòng điền đầy đủ thông tin!');
    }

    try {
        const res = await fetch('/api/register-admin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fullName, email, pass }),
        });
        const data = await res.json();

        if (!data.success) {
            return alert(data.message || 'Đăng ký thất bại!');
        }

        alert(data.message || 'Đăng ký thành công! Kiểm tra email để kích hoạt.');
        container.classList.remove('active');
    } catch (err) {
        alert('Lỗi kết nối server: ' + err.message);
    }
});