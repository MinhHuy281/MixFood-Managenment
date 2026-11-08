// # File này chịu trách nhiệm áp dụng các thuộc tính giao diện động (màu sắc danh mục, màu trạng thái nhật ký, độ rộng thanh tiến trình) từ data-* attributes và điều khiển đóng/mở Hamburger Menu trên thiết bị di động (Responsive <= 768px).
function applyDynamicDataStyles(root = document) {
    root.querySelectorAll('[data-dyn-color]').forEach((el) => {
        if (el.dataset.dynColor) el.style.color = el.dataset.dynColor;
    });
    root.querySelectorAll('[data-dyn-bg]').forEach((el) => {
        if (el.dataset.dynBg) el.style.background = el.dataset.dynBg;
    });
    root.querySelectorAll('[data-dyn-width]').forEach((el) => {
        if (el.dataset.dynWidth) el.style.width = el.dataset.dynWidth;
    });
    root.querySelectorAll('[data-dyn-cat-color]').forEach((el) => {
        if (el.dataset.dynCatColor) el.style.setProperty('--cat-color', el.dataset.dynCatColor);
    });
}

// # Hàm khởi tạo bộ điều khiển Hamburger Menu trượt (Slide-in Drawer) trên màn hình <= 768px
function initMobileNavigationDrawers() {
    const drawerPairs = [
        {
            btnId: 'pos-hamburger-btn',
            navId: 'pos-mobile-nav',
            backdropId: 'pos-nav-backdrop',
            closeBtnId: 'pos-drawer-close',
        },
        {
            btnId: 'topbar-hamburger-btn',
            navId: 'topbar-mobile-nav',
            backdropId: 'topbar-nav-backdrop',
            closeBtnId: 'topbar-drawer-close',
        },
    ];

    drawerPairs.forEach(({ btnId, navId, backdropId, closeBtnId }) => {
        const hamburgerBtn = document.getElementById(btnId);
        const mobileNav = document.getElementById(navId);
        const backdrop = document.getElementById(backdropId);
        const closeBtn = document.getElementById(closeBtnId);

        if (!hamburgerBtn || !mobileNav) return;

        // # Hàm đóng ngăn kéo menu mobile
        const closeMobileMenu = () => {
            mobileNav.classList.remove('is-open');
            hamburgerBtn.classList.remove('is-active');
            hamburgerBtn.setAttribute('aria-expanded', 'false');
            if (backdrop) backdrop.hidden = true;
            document.body.style.overflow = '';
        };

        // # Hàm mở ngăn kéo menu mobile
        const openMobileMenu = () => {
            mobileNav.classList.add('is-open');
            hamburgerBtn.classList.add('is-active');
            hamburgerBtn.setAttribute('aria-expanded', 'true');
            if (backdrop) backdrop.hidden = false;
            document.body.style.overflow = 'hidden';
        };

        // # Bấm nút 3 gạch (Hamburger) để bật/tắt menu
        hamburgerBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = mobileNav.classList.contains('is-open');
            if (isOpen) {
                closeMobileMenu();
            } else {
                openMobileMenu();
            }
        });

        // # Bấm nút X hoặc lớp nền mờ (backdrop) để đóng menu
        if (closeBtn) closeBtn.addEventListener('click', closeMobileMenu);
        if (backdrop) backdrop.addEventListener('click', closeMobileMenu);

        // # Tự động đóng menu khi người dùng bấm vào một link hoặc hành động điều hướng
        mobileNav.addEventListener('click', (e) => {
            const actionLink = e.target.closest('a, .dropdown-action');
            if (actionLink && !actionLink.classList.contains('nav-menu-btn')) {
                closeMobileMenu();
            }
        });

        // # Tự động đóng menu khi nhấn phím Escape hoặc khi phóng to trình duyệt lên Desktop (> 768px)
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && mobileNav.classList.contains('is-open')) {
                closeMobileMenu();
            }
        });

        window.addEventListener('resize', () => {
            if (window.innerWidth > 768 && mobileNav.classList.contains('is-open')) {
                closeMobileMenu();
            }
        });
    });
}

document.addEventListener('DOMContentLoaded', () => {
    applyDynamicDataStyles();
    initMobileNavigationDrawers();
});
