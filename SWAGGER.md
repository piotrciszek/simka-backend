# Swagger API Documentation

## Dostęp do dokumentacji

**Development:** `http://localhost:3000/api-docs`

Swagger jest dostępny **tylko w trybie development** (`NODE_ENV !== 'production'`).

## Jak korzystać z interaktywnej dokumentacji

### 1. Autoryzacja
1. Przejdź do `/api-docs`
2. Użyj endpointu `POST /auth/login` aby otrzymać JWT token
3. Skopiuj token z odpowiedzi
4. Kliknij przycisk "Authorize" na górze strony
5. Wpisz token w formacie: `Bearer YOUR_TOKEN_HERE`
6. Kliknij "Authorize"

### 2. Testowanie endpointów
- Wszystkie endpointy (poza login) wymagają autoryzacji JWT
- Kliknij "Try it out" przy wybranym endpoincie
- Wypełnij wymagane parametry
- Kliknij "Execute"
- Zobacz odpowiedź i status code

### 3. Role użytkowników
- `admin` — pełny dostęp do wszystkich endpointów
- `komisz` — zatwierdzanie taktyk, zarządzanie użytkownikami
- `user` — tylko własne zasoby (drużyna, taktyki)

## Dodawanie nowych endpointów

Aby dodać dokumentację do nowego endpointu:

```typescript
/**
 * @swagger
 * /your-endpoint:
 *   post:
 *     summary: Krótki opis
 *     description: Dokładny opis działania
 *     tags: [TagName]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               field1: { type: string, example: "example" }
 *     responses:
 *       200:
 *         description: Sukces
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/YourSchema'
 */
router.post('/your-endpoint', async (req, res) => {
  // implementation
});
```

## Dostępne schematy

Zdefiniowane w `src/config/swagger.ts`:
- `User` — dane użytkownika
- `Team` — dane drużyny  
- `Tactic` — taktyka drużyny
- `Error` — standardowa odpowiedź błędu

## Tagi organizacyjne

- `Authentication` — login, zmiana hasła
- `Teams` — zarządzanie drużynami
- `Tactics` — taktyki drużyn
- `Users` — zarządzanie użytkownikami
- `Files` — operacje na plikach (CSV, PBP, saves)