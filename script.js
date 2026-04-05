zzdocument.addEventListener('DOMContentLoaded', () => {

    // Smooth Mockup Bar Animations (for Landing Page)
    const bars = document.querySelectorAll('.bar');
    if (bars.length > 0) {
        // Randomize heights slightly on load for dynamic effect
        bars.forEach(bar => {
            const currentHeight = parseInt(bar.style.height);
            const newHeight = Math.max(20, Math.min(100, currentHeight + (Math.random() * 20 - 10)));
            setTimeout(() => {
                bar.style.height = `${newHeight}%`;
            }, 500);
        });
    }

    // Waitlist Form Submission (for Landing Page)
    const waitlistForm = document.getElementById('waitlistForm');
    if (waitlistForm) {
        waitlistForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const emailInput = document.getElementById('waitlistEmail');
            const feedback = document.getElementById('waitlistFeedback');

            if (emailInput.value) {
                const btn = waitlistForm.querySelector('button');
                const originalText = btn.innerHTML;

                // Loading state
                btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="btn-icon" style="animation: spin 1s linear infinite;"><line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="4.93" x2="19.07" y2="7.76"></line></svg>`;

                // Simulate API call
                setTimeout(() => {
                    feedback.textContent = "You're on the list! We'll be in touch soon.";
                    feedback.className = "form-feedback success fade-in-up";
                    emailInput.value = '';
                    btn.innerHTML = originalText;

                    setTimeout(() => {
                        feedback.textContent = "";
                        feedback.className = "form-feedback";
                    }, 5000);
                }, 1200);
            }
        });
    }

    // Auth Forms (Login / Signup)
    const authForm = document.getElementById('authForm');
    if (authForm) {
        authForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const btn = authForm.querySelector('button[type="submit"]');
            const originalText = btn.innerHTML;

            // Show loading
            btn.innerHTML = 'Processing...';
            btn.style.opacity = '0.8';
            btn.disabled = true;

            // Simulate Auth & redirect
            setTimeout(() => {
                // Mock set user in localStorage
                localStorage.setItem('logislink_user', 'true');
                window.location.href = 'dashboard.html';
            }, 1500);
        });
    }

    // Dashboard Interactivity
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            localStorage.removeItem('logislink_user');
            window.location.href = 'index.html';
        });
    }

    // Security mock check on dashboard
    if (window.location.pathname.includes('dashboard.html')) {
        const isAuth = localStorage.getItem('logislink_user');
        // Very basic mock protected route
        if (!isAuth) {
            // Optional: redirect to login if we wanted strict mocking
            // window.location.href = 'login.html';
        }
    }
});

// Add keyframes for spinner dynamically
const style = document.createElement('style');
style.innerHTML = `
    @keyframes spin { 100% { transform: rotate(360deg); } }
`;
document.head.appendChild(style);
