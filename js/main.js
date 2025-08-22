document.addEventListener('DOMContentLoaded', () => {
    console.log("Website loaded successfully!");
    const currentPath = window.location.pathname;
    const navLinks = document.querySelectorAll('nav a');
    navLinks.forEach(link => {
        // Check if the link's href matches the current path exactly or if it's the index and path is root
        const linkPath = new URL(link.href).pathname;
        if (currentPath === linkPath || (linkPath === '/' && currentPath === '/index.html')) {
            link.classList.add('active');
        }
    });
});
