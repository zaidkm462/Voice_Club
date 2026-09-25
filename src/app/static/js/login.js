document.addEventListener("DOMContentLoaded", () => {
    const loginForm = document.getElementById("loginForm");
    const usernameInput = document.getElementById("username");
    const passwordInput = document.getElementById("password");
    const errorDiv = document.getElementById("errorMessage");
    const loginButton = document.getElementById("loginButton");
    const togglePassword = document.getElementById("togglePassword");

    if (!loginForm) {
        return;
    }

    function showError(message) {
        errorDiv.textContent = message;
        errorDiv.style.display = "block";
    }

    function hideError() {
        errorDiv.textContent = "";
        errorDiv.style.display = "none";
    }

    function setLoading(isLoading) {
        loginButton.disabled = isLoading;
        loginButton.classList.toggle("is-loading", isLoading);
    }

    // إظهار / إخفاء كلمة المرور
    togglePassword?.addEventListener("click", () => {
        const isPassword = passwordInput.type === "password";

        passwordInput.type = isPassword ? "text" : "password";

        togglePassword.setAttribute(
            "aria-label",
            isPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"
        );

        togglePassword.setAttribute(
            "aria-pressed",
            String(isPassword)
        );

        togglePassword.innerHTML = isPassword
            ? '<i class="bi bi-eye" aria-hidden="true"></i>'
            : '<i class="bi bi-eye-slash" aria-hidden="true"></i>';
    });

    // إخفاء رسالة الخطأ عند بدء الكتابة من جديد
    [usernameInput, passwordInput].forEach((input) => {
        input.addEventListener("input", () => {
            hideError();
        });
    });

    loginForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        hideError();

        const username = usernameInput.value.trim();
        const password = passwordInput.value;

        if (!username) {
            showError("يرجى إدخال اسم المستخدم.");
            usernameInput.focus();
            return;
        }

        if (!password) {
            showError("يرجى إدخال كلمة المرور.");
            passwordInput.focus();
            return;
        }

        setLoading(true);

        try {
            const response = await fetch("/api/login", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    username: username,
                    password: password
                })
            });

            let data;

            try {
                data = await response.json();
            } catch {
                data = {};
            }

            if (response.ok && data.success) {
                window.location.href = data.redirect_url;
                return;
            }

            showError(
                data.message || "حدث خطأ أثناء تسجيل الدخول."
            );
        } catch (error) {
            console.error("Login request failed:", error);

            showError(
                "عذراً، تعذر الاتصال بالسيرفر. حاول لاحقاً."
            );
        } finally {
            setLoading(false);
        }
    });
});
