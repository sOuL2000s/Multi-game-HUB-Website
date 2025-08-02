document.addEventListener('DOMContentLoaded', () => {
    console.log("Website loaded successfully!");
    const currentPath = window.location.pathname;
    const navLinks = document.querySelectorAll('nav a');
    navLinks.forEach(link => {
        if (link.href.includes(currentPath)) {
            link.classList.add('active');
        }
    });
});
