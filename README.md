# AI & PvP Game Hub

This project is a full-stack web-based game hub featuring classic board games with AI and Player-vs-Player (PvP) modes. The frontend is built with vanilla HTML, CSS, and JavaScript. The real-time PvP functionality is powered by a Node.js WebSocket backend integrated with **Google Firebase** for user authentication and persistent game state using **Firestore**.

## Project Structure

*   `index.html`: The main landing page for selecting games and handling user authentication (login/register).
*   `css/`: Contains styling for the main site (`style.css`) and individual games (`ludo.css`, `chess.css`, `monopoly.css`, `uno.css`).
*   `js/`: Contains core JavaScript (`main.js`), game-specific logic (`ludo.js`, `chess.js`, `monopoly.js`, `uno.js`), and `pvp.js` for WebSocket client-side communication.
*   `games/`: HTML files for each game, linking to their respective CSS and JS.
*   `server/`: Contains the Node.js backend code.
    *   `package.json`: Node.js project dependencies (including `ws` and `firebase-admin`).
    *   `server.js`: The WebSocket server logic, now interacting with Firebase Authentication and Firestore.
    *   `chess-app-399e9-firebase-adminsdk-fbsvc-78562da4a9.json`: Your Firebase Admin SDK private key. **CRITICAL: This file MUST be kept secure and NEVER exposed client-side or committed to a public repository without proper `.gitignore` setup.**

## Getting Started: A Full-Stack Setup

To run this project, you need to set up a Firebase project, the Node.js backend, and the frontend.

### Step 0: Firebase Project Setup (One-Time)

1.  **Create a Firebase Project**: Go to [Firebase Console](https://console.firebase.google.com/) and create a new project. You can name it "chess-app-399e9" if you plan to use the provided SDK key directly.
2.  **Enable Authentication**: In your Firebase project, navigate to "Authentication" -> "Sign-in method" and enable "Email/Password."
3.  **Initialize Firestore Database**: In your Firebase project, navigate to "Firestore Database" and click "Create database." Start in "production mode" (you'll set up security rules later for real deployment, but for local testing, initial rules might be more permissive temporarily).
4.  **Get Web App Config**:
    *   In Firebase Console, go to "Project settings" (gear icon) -> "Your apps."
    *   If you don't have a web app, add one.
    *   Copy the Firebase SDK configuration snippet (it's an object with `apiKey`, `authDomain`, `projectId`, etc.). **You will need this for `index.html`.**
5.  **Service Account Key**: Ensure the `chess-app-399e9-firebase-adminsdk-fbsvc-78562da4a9.json` file is present in your `server/` directory. If you created a new project, you'd download a new key from "Project settings" -> "Service accounts" -> "Generate new private key."

### Step 1: Backend Setup (Node.js)

The backend is a Node.js application that handles WebSocket connections and interacts with Firebase.

1.  **Navigate to the Backend Directory**:
    ```bash
    cd server
    ```

2.  **Install Dependencies**:
    The server uses `ws` for WebSockets and `firebase-admin` for Firebase integration.
    ```bash
    npm install
    # or
    yarn install
    ```

3.  **Start the Backend Server**:
    ```bash
    npm start
    # or
    node server.js
    ```
    The server will start and listen for WebSocket connections, typically on `ws://localhost:8080`.

### Step 2: Frontend Setup

The frontend is a static HTML/CSS/JS application that connects to both Firebase Client SDK and your WebSocket backend.

1.  **Add Firebase Client Config**:
    Open `index.html` and locate the `<script>` tag where it says `<!-- Firebase Configuration goes here -->`. Paste the Firebase SDK configuration object you copied in Step 0 (point 4) there. It should look something like:
    ```html
    <script>
        // Your web app's Firebase configuration
        const firebaseConfig = {
            apiKey: "YOUR_API_KEY",
            authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
            projectId: "YOUR_PROJECT_ID",
            storageBucket: "YOUR_PROJECT_ID.appspot.com",
            messagingSenderId: "YOUR_SENDER_ID",
            appId: "YOUR_APP_ID"
        };
        // Initialize Firebase
        firebase.initializeApp(firebaseConfig);
        const auth = firebase.auth();
        const db = firebase.firestore(); // For Firestore access
    </script>
    ```
    **Make sure to paste your actual configuration!**

2.  **Install a Local Web Server**:
    If you have Node.js installed, you can use `http-server`:
    ```bash
    npm install -g http-server
    ```
    Alternatively, Python's built-in server:
    ```bash
    # For Python 3
    python -m http.server
    # For Python 2
    python -m SimpleHTTPServer
    ```
    Or use a VS Code extension like "Live Server".

3.  **Start the Frontend Server**:
    Navigate to the project's **root directory** (where `index.html` is) in your terminal and run:
    ```bash
    http-server .
    ```
    or
    ```bash
    python -m http.server
    ```
    This will usually serve the website on `http://localhost:8080` (for `http-server`) or `http://localhost:8000` (for Python). Open this URL in your browser. **Ensure this port is different from your Node.js backend if you used `http-server` for both!** (e.g., backend on 8080, frontend on 8000, or vice versa).

## Game Features

### User Authentication
*   Register new accounts with Email & Password.
*   Login with existing accounts.
*   User status displayed on the homepage and game pages.
*   All online PvP actions are now associated with an authenticated user ID.

### Ludo
*   Local PvP (Pass & Play)
*   Play vs AI (basic strategy)
*   Online PvP (requires backend server and authentication)
*   Full Ludo rules implemented (moving from base on 6, sending opponents home, extra turn on 6 / kill / token home, 3 consecutive 6s skip turn).
*   Online game state is now persistent in Firestore.

### Chess
*   Local PvP (Pass & Play)
*   Play vs AI (basic strategy with piece movement logic and basic check detection)
*   Online PvP (requires backend server and authentication)
*   Basic chess movement rules for all pieces.
*   Online game state is now persistent in Firestore.
*   **Limitations**: Does not include advanced rules like castling, en passant, pawn promotion, or full checkmate detection. AI is very basic.

### Uno & Monopoly
*   "Coming Soon" placeholders with basic UI structures.
*   Online PvP buttons are present but will only initiate a basic connection to the backend and authentication, not a functional game. Implementing these complex games fully would be a separate, large project.

## Important Notes for Production Deployment

*   **Firebase Security Rules**: For Firestore, you MUST implement robust security rules to prevent unauthorized data access or modification. Currently, for development, rules might be open, but this is a critical security vulnerability in production.
*   **Backend Validation**: The server-side game logic provides more authoritative state management but could be further enhanced with more extensive validation of every move against game rules to completely prevent client-side tampering.
*   **Scalability**: A single Node.js WebSocket server might be sufficient for small-scale use. For many concurrent users, consider:
    *   **Load Balancing**: Distributing traffic across multiple server instances.
    *   **State Synchronization**: If using multiple backend instances, ensuring game state is correctly synchronized (e.g., using Redis Pub/Sub, or relying purely on Firestore as the source of truth).
*   **Deployment**: Deploy your Node.js backend to a cloud platform (e.g., Google Cloud Run, Heroku, AWS EC2/ECS). Deploy your static frontend files to a static hosting service (e.g., Firebase Hosting, Netlify, Vercel, Nginx).
*   **Error Handling and Logging**: Implement more comprehensive error handling, logging, and monitoring for both frontend and backend.
*   **Advanced AI**: For truly competitive AI players, integrate more sophisticated algorithms (e.g., MiniMax with Alpha-Beta Pruning for Chess, Monte Carlo Tree Search).
*   **Matchmaking**: The current matchmaking is very basic. A real system would have lobbies, skill-based matchmaking, etc.
*   **Real-time Database vs. Firestore**: Firestore is excellent for structured data and real-time updates. For extremely high-throughput, low-latency, non-structured data needs, Firebase Realtime Database could also be considered, but Firestore generally offers more powerful querying and scaling features for game states.
