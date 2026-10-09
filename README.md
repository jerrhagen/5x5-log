# 5x5-logg

En enkel träningslogg för StrongLifts-liknande 5x5 som fungerar på både dator och mobil. Den kan installeras som app på hemskärmen och fungerar offline.

- **Logga pass**: pass A (knäböj, bänkpress, stångrodd) och B (knäböj, axelpress, marklyft 1×5) växlar automatiskt.
- **Föreslagna vikter**:
  - Klarade du alla set förra gången föreslås +2,5 kg (marklyft +5 kg).
  - Missade du reps föreslås samma vikt.
  - Efter 3 missade pass i rad på samma vikt föreslås deload −10 %.
  - Allt detta går att ändra under Inställningar.
- **Set-ringar**: tryck en gång för 5 reps, och tryck igen för att minska antalet (4, 3, … 0, tom).
- **Vilotimer**: startar automatiskt när ett set är klart. Den är 3 min efter ett klarat set och 5 min efter ett missat. Du får ljud och vibration när det är dags. Skärmen hålls tänd medan timern går.
- **Kommentar och kroppsvikt** kan läggas till per pass.
- **Progress**:
  - Arbetsvikt per övning över tid, som grafen i arket "Biff".
  - Målsektion där målet är kroppsvikt × faktor och jämförs med ditt bästa klarade lyft.
  - Kroppsvikt över tid.
  - Tabellvy.
- **Synk med Google Sheets**: passen sparas i ditt kalkylark. De syns på alla enheter och skrivs in på rätt datumrad i årsfliken, så att dina gamla grafer i arket fortsätter att uppdateras.
- **Import** av historiken direkt från flikarna i arket, eller genom att klistra in/ladda upp CSV.

All data sparas lokalt i webbläsaren och (om du kopplar på synk) i ditt eget Google-ark. Ingen träningsdata ligger i det här repot.

---

## 1. Koppla Google-arket (för synk mellan dator och mobil)

1. Öppna kalkylarket **Biff** → **Tillägg → Apps Script**.
2. Ta bort det som står i `Code.gs` och klistra in hela innehållet från [`apps-script/Code.gs`](apps-script/Code.gs).
3. Byt `TOKEN` högst upp till en egen hemlig nyckel, t.ex. en lång slumpad fras. Spara.
4. Klicka **Driftsätt → Ny driftsättning**:
   - Typ: **Webbapp**
   - Kör som: **Jag**
   - Vem har åtkomst: **Alla**. Det behövs för att appen ska kunna anropa skriptet. Nyckeln skyddar datan.
5. Godkänn behörigheterna och kopiera **webbappens URL** (slutar på `/exec`).
6. Öppna 5x5-loggen → **Inställningar** → klistra in URL och nyckel → **Testa och synka**.
7. Tryck **Importera historik från arket**. Appen läser flikarna (t.ex. `2024-2025`, `2025-2026`, `2026`) och lägger in alla tidigare pass.
8. Gör steg 6 på mobilen också (URL + nyckel). Sedan hämtar den allt automatiskt.

Bra att veta:

- Appen skapar en ny flik **Logg** med en rad per övning: datum, pass, vikt, reps per set, kommentar. Ändra inte i den fliken för hand.
- När du sparar ett pass skrivs vikterna även in på datumraden i den nyaste årsfliken (kolumnerna Knäböj, Bänkpress …). Om du missade reps skrivs de i kolumnen *kommentarer*, t.ex. `Axelpress 5/5/5/5/4`. Vill du inte det, sätt `SKRIV_TILL_ARSFLIK = false`.
- Om du tar bort ett pass i appen tas det bort från fliken Logg, men inte från årsflikens datumrad.
- Importerad historik har bara vikter (arket har inga reps), så alla gamla pass räknas som klarade. Dina kommentarer följer med.
- Har du ändrat i `Code.gs` behöver du göra **Driftsätt → Hantera driftsättningar → Redigera → Ny version** för att ändringen ska gälla.

## 2. Publicera webbplatsen

Appen är helt statisk (HTML/CSS/JS, inga beroenden) och kan ligga var som helst.

**GitHub Pages**: workflowet `.github/workflows/pages.yml` publicerar automatiskt vid push till `main`.

1. Repo → **Settings → Pages → Source: GitHub Actions**.
2. Merga till `main`. Adressen blir `https://jerrhagen.github.io/5x5-log/`.

> GitHub Pages för **privata** repon kräver GitHub Pro. Antingen gör du repot publikt (det innehåller ingen träningsdata, och nyckeln sparas bara på dina enheter) eller så kopplar du repot till t.ex. **Cloudflare Pages** eller **Netlify**, som är gratis även för privata repon. Där behövs inget byggkommando, och mappen som publiceras är roten.

**Installera på mobilen**: öppna adressen. På iPhone väljer du Safari → Dela → *Lägg till på hemskärmen*. På Android väljer du Chrome → ⋮ → *Installera app*.

## Utveckling

```sh
npm start   # lokal server på http://localhost:8080
npm test    # enhetstester för logiken (viktförslag, import m.m.)
```

| Fil | Innehåll |
| --- | --- |
| `index.html`, `css/style.css` | Gränssnittet |
| `js/logic.js` | Program, viktförslag, deload, import/export (ren logik, testad) |
| `js/data.js` | Lokal lagring + synk mot Apps Script |
| `js/chart.js` | Egen SVG-graf med tooltip |
| `js/app.js` | Vyer: Pass, Historik, Progress, Inställningar |
| `sw.js`, `manifest.webmanifest` | Offline och installation som app |
| `apps-script/Code.gs` | Backend i ditt Google-ark |

Programmet (övningar, set × reps) finns i `PROGRAM` och `EXERCISES` i `js/logic.js`.
