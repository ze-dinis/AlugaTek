# Alugatek Support Portal

Portal interno para equipa de suporte gerir disputas de clientes.

## Requisitos

- Node.js 20+
- Backend da API ativo em `http://localhost:5000`

## Configuração

1. Copiar `.env.example` para `.env`
2. Ajustar `VITE_API_URL` se necessário

## Execução

```bash
npm install
npm run dev
```

O portal ficará disponível por omissão em `http://localhost:5174`.

## Endpoints esperados

- `POST /api/support/auth/login`
- `GET /api/support/disputes`
- `GET /api/support/disputes/{id}`
- `POST /api/support/disputes/{id}/reply`
- `PATCH /api/support/disputes/{id}/assign`
- `PATCH /api/support/disputes/{id}/resolve`
- `POST /api/support/users/{userId}/ban`
