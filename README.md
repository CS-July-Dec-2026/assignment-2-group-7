# ShopLux - Vulnerability Demo

## Demo Video

**Link** - [Google Drive Link](https://drive.google.com/file/d/1ANTTR5zyH9suCtxT2BsSZmFuftZYJdwQ/view?usp=sharing)

## About the App

**ShopLux** is a mock premium e-commerce web application created for educational purposes. It features a product catalog, a functional shopping cart, user authentication (with built-in demo accounts), and a simulated "Refer a Friend" marketing feature. The application is built using Express.js and uses an in-memory session store.

## How to Run

1. **Install Dependencies:**
   Open your terminal in the project directory and run:

   ```bash
   npm install
   ```

2. **Start the Server:**
   Run the following command to start the application:

   ```bash
   node server.js
   ```

3. **Access the App:**
   Open your web browser and navigate to:
   [http://localhost:3000](http://localhost:3000)

## Vulnerability Details

This application contains a **Session Fixation** vulnerability.

### What is Session Fixation?

Session Fixation is a security vulnerability where an attacker tricks a victim into using a predetermined session ID.
If the application does not assign a new session ID upon successful login, the victim will authenticate using the attacker's known session ID. As a result, the attacker can use the same session ID to hijack the victim's authenticated session, gaining unauthorized access to their account.

### How it works in ShopLux

1. **The Attack Vector:** The `/refer/:code` route (lines 155-165) acts as a "Refer a Friend" feature. It expects a `ref` query parameter.
2. **Client-Side Cookie Manipulation:** When a victim visits a link like `http://localhost:3000/refer/SAVE20?ref=<ATTACKER_SESSION_ID>`, the client-side JavaScript in `refer.html` takes the attacker's session ID from the URL and sets it as the victim's `SHOPLUX_SESSION` cookie. This is possible because the session cookie is insecurely created with `httpOnly: false`.
3. **The Fixation:** When the victim proceeds to log in (e.g., as Alice) at the `/api/login` endpoint, the server simply authenticates the existing session ID instead of generating a new one. Since the attacker already possesses this session ID, they instantly become authenticated as the victim.

## How to Fix the Vulnerability

To secure the application against Session Fixation, you must regenerate the session ID upon successful authentication and prevent client-side JavaScript from modifying the session cookie.

### Step 1: Regenerate Session ID on Login

Modify `server.js` to assign a fresh session ID when a user logs in successfully.

1. **Remove or Comment Out** the vulnerable session update (Lines **204-209**):

   ```javascript
   // Remove this:
   req.session.user = {
     username: user.username,
     name: user.name,
     email: user.email,
   };
   req.session.isAuthenticated = true;
   ```

2. **Uncomment** the secure session generation block provided in the file (Lines **214-234**):

   ```javascript
   const oldCart = req.session.cart || [];
   delete sessions[req.sessionId];

   const newSessionId = generateSessionId();
   sessions[newSessionId] = {
     cart: oldCart,
     user: { username: user.username, name: user.name, email: user.email },
     isAuthenticated: true,
     createdAt: Date.now(),
   };

   res.cookie("SHOPLUX_SESSION", newSessionId, {
     httpOnly: false, // (See Step 2 for updating this to true)
     sameSite: "lax",
   });

   return res.json({
     success: true,
     user: { username: user.username, name: user.name, email: user.email },
     newSession: true,
   });
   ```

   _(Note: Be sure that uncommenting these lines successfully replaces the missing response in the endpoint)._

## Other Useful Info

- **Demo Accounts:** You can test the application using the built-in accounts:
  - `alice` / `password123`
  - `bob` / `password456`
- **In-Memory Sessions:** Keep in mind that since sessions are stored in an object (`const sessions = {}`), restarting the Node.js server will clear all active sessions and carts.
