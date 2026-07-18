# Alugatek

A technology item rental platform — rent laptops, phones, cameras, and more.

## Project Structure

```
alugatek/
├── backend/          # ASP.NET Core 9 Web API
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
└── docker-compose.yml
```

## Backend (ASP.NET Core 9)

### Tech Stack
- **Framework**: ASP.NET Core 9 Web API
- **ORM**: Entity Framework Core 9 + Npgsql (PostgreSQL)
- **Auth**: JWT Bearer + Google OAuth (ID-token exchange)
- **Docs**: Swagger / OpenAPI (Swashbuckle)

### API Endpoints

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | `/api/auth/register` | — | Register with email/password |
| POST | `/api/auth/login` | — | Login, returns JWT |
| POST | `/api/auth/oauth/google` | — | Exchange Google ID token for JWT |
| GET | `/api/items` | — | List items (filter by category/search) |
| GET | `/api/items/{id}` | — | Item details |
| POST | `/api/items` | ✅ | List a new item |
| PUT | `/api/items/{id}` | ✅ | Update own item |
| DELETE | `/api/items/{id}` | ✅ | Remove own item |
| GET | `/api/items/categories` | — | List categories |
| POST | `/api/rentals` | ✅ | Create rental |
| GET | `/api/rentals/my` | ✅ | My rentals |
| PATCH | `/api/rentals/{id}/cancel` | ✅ | Cancel rental |
| POST | `/api/reviews` | ✅ | Leave review (post-rental) |
| GET | `/api/reviews/item/{itemId}` | — | Reviews for an item |

`POST /api/items` supports both:
- `application/json` body (`title`, `description`, `dailyRate`, `categoryId`, optional `imageUrl`)
- `multipart/form-data` with the same fields and optional `photo` file (JPEG, PNG, WEBP up to 5 MB)

### Running the backend

#### With Docker Compose (recommended)
```bash
# From repo root — starts PostgreSQL + API
docker compose up --build -d
# If no build is necessary:
docker compose up -d
# Swagger UI: http://localhost:5000/swagger
```

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

# Android release
npx react-native run-android --mode=release

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

## Security Notes

- **Change the JWT secret** in production — use a random 64+ character string
- Store secrets in environment variables / Azure Key Vault, never in source control
- The `appsettings.json` connection string uses default dev credentials — change before deploying
