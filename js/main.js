document.addEventListener('DOMContentLoaded', () => {
    console.log("Website loaded successfully!");

    // Frontend UI elements for auth
    const authSection = document.getElementById('auth-section');
    const userDisplay = document.getElementById('user-display');
    const authButton = document.getElementById('auth-button'); // Login/Logout button
    const loginRegisterForm = document.getElementById('login-register-form');
    const authTitle = document.getElementById('auth-title');
    const authEmailInput = document.getElementById('auth-email');
    const authPasswordInput = document.getElementById('auth-password');
    const loginButton = document.getElementById('login-button');
    const registerButton = document.getElementById('register-button');
    const toggleAuthModeButton = document.getElementById('toggle-auth-mode');
    const authErrorMessage = document.getElementById('auth-error-message');
    const gameSelectionSection = document.querySelector('.game-selection');

    let isLoginMode = true; // State for login/register form

    // Initialize Firebase (already done in index.html, just get the auth instance)
    // const auth = firebase.auth(); // Assuming 'auth' is globally available from index.html

    // --- Authentication UI Logic ---
    function updateAuthUI(user) {
        if (user) {
            userDisplay.textContent = `Welcome, ${user.displayName || user.email}!`;
            userDisplay.style.display = 'inline';
            authButton.textContent = 'Logout';
            authButton.style.display = 'inline';
            loginRegisterForm.style.display = 'none'; // Hide auth form
            gameSelectionSection.style.display = 'grid'; // Show game cards
        } else {
            userDisplay.style.display = 'none';
            authButton.textContent = 'Login';
            authButton.style.display = 'inline';
            loginRegisterForm.style.display = 'block'; // Show auth form
            gameSelectionSection.style.display = 'none'; // Hide game cards
        }
    }

    // Firebase Auth State Listener
    auth.onAuthStateChanged((user) => {
        updateAuthUI(user);
    });

    // Handle Login/Logout button click
    authButton.addEventListener('click', () => {
        if (auth.currentUser) {
            // User is logged in, perform logout
            auth.signOut().then(() => {
                authErrorMessage.textContent = '';
                console.log('User signed out.');
            }).catch((error) => {
                console.error('Logout error:', error);
                authErrorMessage.textContent = `Logout failed: ${error.message}`;
            });
        } else {
            // User is logged out, show login form if not already visible
            loginRegisterForm.style.display = 'block';
            gameSelectionSection.style.display = 'none';
        }
    });

    // Toggle between Login and Register modes
    toggleAuthModeButton.addEventListener('click', () => {
        isLoginMode = !isLoginMode;
        if (isLoginMode) {
            authTitle.textContent = 'Login';
            loginButton.style.display = 'inline';
            registerButton.style.display = 'none';
            toggleAuthModeButton.textContent = 'Need an account? Register';
        } else {
            authTitle.textContent = 'Register';
            loginButton.style.display = 'none';
            registerButton.style.display = 'inline';
            toggleAuthModeButton.textContent = 'Already have an account? Login';
        }
        authErrorMessage.textContent = ''; // Clear error on mode switch
    });

    // Login button click handler
    loginButton.addEventListener('click', () => {
        const email = authEmailInput.value;
        const password = authPasswordInput.value;
        authErrorMessage.textContent = '';

        if (!email || !password) {
            authErrorMessage.textContent = 'Please enter email and password.';
            return;
        }

        auth.signInWithEmailAndPassword(email, password)
            .then((userCredential) => {
                console.log('User logged in:', userCredential.user.email);
                // The onAuthStateChanged listener will handle UI update
            })
            .catch((error) => {
                console.error('Login error:', error);
                authErrorMessage.textContent = `Login failed: ${error.message}`;
            });
    });

    // Register button click handler
    registerButton.addEventListener('click', () => {
        const email = authEmailInput.value;
        const password = authPasswordInput.value;
        authErrorMessage.textContent = '';

        if (!email || !password) {
            authErrorMessage.textContent = 'Please enter email and password.';
            return;
        }
        if (password.length < 6) {
            authErrorMessage.textContent = 'Password must be at least 6 characters long.';
            return;
        }

        auth.createUserWithEmailAndPassword(email, password)
            .then((userCredential) => {
                // Set display name to email for now, can be updated later
                return userCredential.user.updateProfile({
                    displayName: email.split('@')[0] // Simple default name
                });
            })
            .then(() => {
                console.log('User registered and logged in:', auth.currentUser.email);
                // The onAuthStateChanged listener will handle UI update
            })
            .catch((error) => {
                console.error('Registration error:', error);
                authErrorMessage.textContent = `Registration failed: ${error.message}`;
            });
    });

    // --- Navigation Active Link (existing functionality) ---
    const currentPath = window.location.pathname;
    const navLinks = document.querySelectorAll('nav a');
    navLinks.forEach(link => {
        const linkPath = new URL(link.href).pathname;
        if (currentPath === linkPath || (linkPath === '/' && currentPath === '/index.html')) {
            link.classList.add('active');
        }
    });
});
