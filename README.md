# Alugatek

A technology item rental platform — rent laptops, phones, cameras, and more.

## Project Structure

```
alugatek/
├── backend/          # ASP.NET Core 10 Web API
│   ├── src/
│   │   ├── Alugatek.API/           # Controllers, DTOs, Program.cs
│   │   ├── Alugatek.Domain/        # Entities, enums
│   │   └── Alugatek.Infrastructure # EF Core DbContext, JwtService, Migrations
│   └── Dockerfile
├── mobile/           # React Native (TypeScript, bare workflow)
│   ├── src/
│   │   ├── config/       # API base URL, OAuth client IDs
│   │   ├── navigation/   # React Navigation stack/tab setup
│   │   ├── screens/      # Auth, Home, Items, Rentals, Profile
│   │   ├── services/     # Axios API clients
│   │   ├── store/        # Zustand auth store
│   │   └── types/        # Shared TypeScript interfaces
│   └── App.tsx
├── website/          # Static marketing site served by Nginx
└── docker-compose.yml
```

## Backend (ASP.NET Core 10)

### Tech Stack
- **Framework**: ASP.NET Core 10 Web API
- **ORM**: Entity Framework Core 10 + Npgsql (PostgreSQL)
- **Auth**: JWT Bearer + Google OAuth (ID-token exchange)
- **Docs**: Swagger / OpenAPI (Swashbuckle)

### API Endpoints

#### Public endpoints

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/health` | — | Health check (API + DB) |
| POST | `/api/auth/register` | — | Register with email/password |
| POST | `/api/auth/login` | — | Login, returns JWT |
| GET | `/api/auth/verify-email?email=...&token=...` | — | Verify email via query link |
| POST | `/api/auth/verify-email` | — | Verify email via JSON body |
| POST | `/api/auth/resend-verification` | — | Resend verification email |
| POST | `/api/auth/oauth/google` | — | Exchange Google ID token for JWT |
| POST | `/api/support/auth/login` | — | Support/admin login |
| GET | `/api/items` | — | List items (filter by category/search) |
| GET | `/api/items/{id}` | — | Item details |
| GET | `/api/items/categories` | — | List categories |
| GET | `/api/users/{userId}/rental-rating` | — | Public user rental rating summary |
| GET | `/api/users/{userId}/rental-reviews` | — | Public user rental review comments (`limit`, `skip`, `sort=recent|highest|lowest`) |

#### Authenticated user endpoints

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | `/api/items` | ✅ | List a new item |
| POST | `/api/items/upload` | ✅ | Create item with multipart photos |
| POST | `/api/items/upload-image` | ✅ | Upload a single image |
| POST | `/api/items/upload-images` | ✅ | Upload multiple images |
| PUT | `/api/items/{id}` | ✅ | Update own item |
| DELETE | `/api/items/{id}` | ✅ | Soft-delete own item (blocked while rental is in progress) |
| GET | `/api/items/my` | ✅ | List own items |
| GET | `/api/items/favorites` | ✅ | List favorite items |
| POST | `/api/items/{id}/favorite` | ✅ | Add item to favorites |
| DELETE | `/api/items/{id}/favorite` | ✅ | Remove item from favorites |
| POST | `/api/rentals` | ✅ | Create rental |
| GET | `/api/rentals/{id}` | ✅ | Rental details |
| GET | `/api/rentals/my` | ✅ | My rentals |
| PATCH | `/api/rentals/{id}/cancel` | ✅ | Cancel rental |
| PATCH | `/api/rentals/{id}/confirm` | ✅ | Owner confirms pending rental |
| PATCH | `/api/rentals/{id}/decline` | ✅ | Owner declines pending rental |
| PATCH | `/api/rentals/{id}/pay` | ✅ | Renter pays for rental |
| PATCH | `/api/rentals/{id}/renew` | ✅ | Renter renews rental |
| GET | `/api/rentals/{id}/renew-quote` | ✅ | Renewal price quote |
| PATCH | `/api/rentals/{id}/return` | ✅ | Renter requests return |
| PATCH | `/api/rentals/{id}/confirm-return` | ✅ | Owner confirms return |
| PATCH | `/api/rentals/{id}/decline-return` | ✅ | Owner declines return |
| POST | `/api/rentals/{id}/dispute` | ✅ | Open rental dispute |
| GET | `/api/chat/conversations` | ✅ | List chat conversations |
| GET | `/api/chat/{itemId}?otherUserId=...` | ✅ | Get messages for an item chat thread |
| POST | `/api/chat` | ✅ | Send chat message |
| POST | `/api/notifications/device-token/register` | ✅ | Register push token |
| POST | `/api/notifications/device-token/unregister` | ✅ | Unregister push token |
| POST | `/api/reports` | ✅ | Report a user/listing |
| POST | `/api/rental-reviews` | ✅ | Submit renter/owner review |
| GET | `/api/rental-reviews/rental/{rentalId}/eligibility` | ✅ | Review eligibility for current user |

#### Support/Admin endpoints (`SupportAccess` policy)

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/api/support/reports` | ✅ Support | List user reports |
| GET | `/api/support/disputes` | ✅ Support | List dispute inbox |
| GET | `/api/support/disputes/{id}` | ✅ Support | Dispute details |
| POST | `/api/support/disputes/{id}/reply` | ✅ Support | Reply in dispute thread |
| PATCH | `/api/support/disputes/{id}/assign` | ✅ Support | Assign dispute |
| PATCH | `/api/support/disputes/{id}/resolve` | ✅ Support | Resolve dispute |
| POST | `/api/support/users/ban-by-email` | ✅ Support | Ban user by email |
| POST | `/api/support/users/{userId}/ban` | ✅ Support | Ban user by id |

#### Public webhook endpoint

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | `/api/stripe/webhook` | — | Stripe webhook receiver |

`POST /api/items` supports both:
- `application/json` body (`title`, `description`, `dailyRate`, `categoryId`, optional `imageUrl`)
- `multipart/form-data` with the same fields and optional `photo` file (JPEG, PNG, WEBP up to 5 MB)

### Running the backend

#### With Docker Compose (recommended)
```bash
# From repo root — starts PostgreSQL + API + static landing page
docker compose up --build -d
# If no build is necessary:
docker compose up -d
# Swagger UI: http://localhost:5000/swagger
# Landing page: http://localhost:8088
```

### Marketing Website

The static promotional site lives in `website/index.html` and is containerized with Nginx for easy deployment.

```bash
# Run only the landing page
docker compose up --build website -d

# Open the site
http://localhost:8088
```

Replace the placeholder contact and download links in `website/index.html` before publishing to a real domain.

#### Locally
1. Start PostgreSQL: `docker compose up postgres`
2. Update `appsettings.json` connection string if needed
3. `cd backend && dotnet run --project src/Alugatek.API`

> The API auto-runs migrations on startup.

### Configuration (`appsettings.json`)
```json
{
  "ConnectionStrings": {
    "DefaultConnection": "Host=localhost;Port=5432;Database=alugatek;Username=postgres;Password=postgres"
  },
  "Jwt": {
    "Key": "CHANGE_THIS_TO_A_LONG_RANDOM_SECRET_AT_LEAST_32_CHARS",
    "Issuer": "alugatek-api",
    "Audience": "alugatek-app"
  }
}
```

---

## Mobile (React Native)

### Tech Stack
- **Framework**: React Native 0.76 (bare workflow, TypeScript)
- **Navigation**: React Navigation (stack + bottom tabs)
- **State**: Zustand
- **HTTP**: Axios (with JWT interceptor)
- **Auth**: `@react-native-google-signin/google-signin`
- **Storage**: `@react-native-async-storage/async-storage`

### Setup

```bash
cd mobile
npm install

# Android
npm run android
adb devices
adb -s <device_number> reverse tcp:8081 tcp:8081
adb -s <device_number> reverse tcp:5000 tcp:5000

# Android release test
npx react-native run-android --mode=release

# Android release
cd android
.\gradlew bundleRelease

# iOS (macOS only)
cd ios && pod install && cd ..
npm run ios
```

### Connecting to the API

Edit `src/config/index.ts`:
- **Android emulator**: `http://10.0.2.2:5000/api` (default)
- **iOS simulator**: `http://localhost:5000/api`
- **Physical device**: your machine's local IP

Set your Google OAuth Web Client ID in `GOOGLE_WEB_CLIENT_ID`.

---

## Tests

### Backend (xUnit)

`backend/tests/Alugatek.Tests` holds unit tests for the domain services and
integration tests that exercise the controllers against an EF Core in-memory
database with fake payment/push/storage providers.

```bash
cd backend
dotnet test tests/Alugatek.Tests/Alugatek.Tests.csproj
```

### Mobile (Jest)

Tests live in `mobile/src/**/__tests__`:

- **Unit** — utils, config helpers, the auth store and the API service layer.
- **Integration** — screens rendered with `@testing-library/react-native`
  (Login, Register, MyItems, Profile). These drive the real service → axios
  interceptor → zustand store → AsyncStorage stack; only the HTTP transport is
  swapped out via `src/testing/httpMock.ts`.

```bash
cd mobile
npm test
```

---

## Security Notes

- **Change the JWT secret** in production — use a random 64+ character string
- Store secrets in environment variables / Azure Key Vault, never in source control
- The `appsettings.json` connection string uses default dev credentials — change before deploying
