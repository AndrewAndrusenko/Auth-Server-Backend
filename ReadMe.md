# Central Authentication Service & Internal IdP (Backend Layer)

> **High-performance, stateless Central Authentication Service and Identity Provider (IdP)**. Built with Node.js, Express, and TypeScript, this subsystem serves as the secure backend core responsible for polymorphic account restoration, session persistence, role-based authorization, and high-concurrency token synchronization using a pure MongoDB driver configuration.

This service is engineered to interact seamlessly with the accompanying **Angular Frontend Layer** via an isolated, secure, and cookie-encapsulated authentication architecture.

---

## 🏗️ Core Backend Architectural Components

The backend architecture is structured around an isolated, decoupled middleware pipeline and stateless session token validation to guarantee rapid scaling, low coupling, and predictable request lifecycle handling:

### 1. Cookie-Encapsulated JWT Engine (`HttpOnly + SameSite=Lax`)
To defend against Cross-Site Scripting (XSS) and token theft vulnerabilities, this service never exposes raw JSON Web Tokens in response body payloads. 
*   **Transport Layer:** Access and Refresh tokens are issued exclusively via browser-managed `Set-Cookie` headers containing `HttpOnly`, `Secure`, and `SameSite=Lax` parameters.
*   **CORS Pipeline Configuration:** The system enforces strict CORS middleware policies allowing verified origins while explicitly declaring `Access-Control-Allow-Credentials: true` to support the frontend's transport-level interceptor.

### 2. High-Concurrency Token Synchronization Endpoint (`/users/refresh`)
Engineered explicitly to support the client-side RxJS `exhaustMap` semaphore pipeline. 
*   **Atomic Rotation:** The middleware extracts and verifies the incoming valid refresh cookie payload, rotates the session bounds, invalidates the old token, and issues a new cookie set.
*   **Administrative Revocation Check:** Every hit to this endpoint triggers a microsecond lookup against the `sessions` collection in MongoDB. If an administrator has blacklisted or dropped the user's active session records from the management dashboard, the endpoint halts execution instantly and drops an explicit `AUTHENTICATION_FAILED` (401) error payload.

### 3. Polymorphic Password Restoration Handler
Supports the morphing client-side `PasswordRestoreComponent` layout by handling two distinct cryptographic lifecycle states over unified database records inside MongoDB:
*   **State A (Token Generation):** Validates existence via asynchronous criteria queries directly inside MongoDB, generates a time-restricted (TTL), single-use cryptographic token payload, and fires outbound email verification dispatches with anti-spam rate limits.
*   **State B (Credential Overwrite):** Processes parametric incoming payloads containing target identities and reset tokens, securely performs complexity verification, overrides password hashes (using `bcrypt`), and immediately invalidates the consumed token.

### 4. Parametric Email Confirmation Engine (`Nodemailer`)
Coordinating with the client's `EmailConfirmComponent`, this subsystem handles inbound activation links sent to user mailboxes. Users are structurally restricted from logging in until their email is explicitly confirmed. The engine handles entry traffic across both strict path parameters and query strings, executing safe validation queries before updating the target user profile state in MongoDB.

---

## 🗺️ Core API Architecture & Endpoints

### Base URL Route
`/api/v1`

### 🔑 Authentication & Session Management

| Method | Endpoint | Description | Auth Requirement / Cookies | Expected Failures (400/401) |
| :--- | :--- | :--- | :--- | :--- |
| **POST** | `/auth/register` | Registers a new user account profile | None | `EMAIL_ALREADY_EXISTS` |
| **POST** | `/auth/login` | Authenticates identity and sets initial HttpOnly cookies | None | `INVALID_CREDENTIALS`, `EMAIL_UNCONFIRMED` |
| **GET** | `/users/refresh` | Evaluates background session and rotates cookies | Requires valid Refresh Cookie | `JWT_EXPIRED`, `AUTHENTICATION_FAILED` |
| **POST** | `/auth/logout` | Purges server-side session from MongoDB & clears client cookies | Requires active Access Cookie | `UNAUTHORIZED` |

### 🛠️ Polymorphic Account Recovery & Email Validation

| Method | Endpoint | Description | Payload Constraints | Expected Failures |
| :--- | :--- | :--- | :--- | :--- |
| **POST** | `/auth/reset-password/request` | Validates identity and issues single-use recovery token | `email` (Required) | `EMAIL_NOT_FOUND`, `RATE_LIMIT_EXCEEDED` |
| **POST** | `/auth/reset-password/verify` | Accepts verification link payload and overrides credentials | `id`, `token`, `newPassword` | `TOKEN_EXPIRED`, `INVALID_TOKEN` |
| **GET** | `/auth/confirm-email` | Validates inbound activation link containing unique user ID + Token | `id`, `token` (as query parameters or path parameters) | `ACTIVATION_LINK_INVALID` |

### 👑 Administrative Operations

| Method | Endpoint | Description | Role Required |
| :--- | :--- | :--- | :--- |
| **DELETE** | `/admin/sessions/:userId` | Instantly drops and revokes all active session records | **ADMIN** (Custom backend middleware) |

---

## ⚙️ Environment Variables Configuration (`.env`)

Create a local `.env` file in your root workspace based on the `.env.example` file. The service strictly requires the following security and transport vectors to interface with the Angular application layout:
