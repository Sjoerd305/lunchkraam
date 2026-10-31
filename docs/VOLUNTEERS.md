# Handleiding vrijwilligers — financiën & import

Korte gids voor penningmeester en andere vrijwilligers die **Revolut**, **Boodschappen** en **Financiën** in de app gebruiken. Technische diepgang staat in [ARCHITECTURE.md](ARCHITECTURE.md).

## Rollen

- **Beheerder (admin):** volledig beheer (o.a. accounts, instellingen, alle financiële schermen).
- **Kraammedewerker (operator):** kraampagina (incl. betalingswachtrij onder het tabblad **Betalingen**) en de financiële schermen **Overzicht**, **Financiën**, **Verkoopcontrole** en **Boodschappen**.

## Waar vind je wat?

| Taak | Scherm in de app |
|------|------------------|
| Revolut-afschrift (CSV) importeren en het saldo uit die export zien | **Beheer → Financiën** — blok Revolut-saldo / Revolut-import; het saldo staat ook bovenaan **Beheer → Overzicht** |
| Uitgaven en bonnen, contante kas | **Beheer → Boodschappen** |
| Jaaroverzicht omzet / uitgaven / tosti’s / grafieken | **Beheer → Overzicht** (jaarkeuze bovenaan) |
| Betaling van een online kaartaanvraag accorderen (maakt de kaart actief; tot dan kan het lid wel bestellen maar levert de kraam niet) | **Kraam → Betalingen** of de knop *Betaling accorderen* bij de bestelling |
| Lokaal account omzetten naar Google-account, of een gedeactiveerd account verwijderen | **Beheer → Accounts** (alleen beheerder) |
| Knipje-historie van een kaart bekijken of terugdraaien | **Kraam → Knipje** (lid: **Mijn kaarten**) |
| Schatting van een fysieke kaart corrigeren | **Kraam → Knipje → Schatting zetten** |
| Prijzen, Tikkie-links en overschrijfinstructies | **Beheer → Instellingen** (alleen beheerder) |
| Openstaande bankregels koppelen aan een kaartverkoop | **Beheer → Financiën** |
| Maandvergelijking Revolut-import vs app-omzet | **Beheer → Verkoopcontrole** (nieuw) |

## Principe: bank vs app

- **Revolut-import** legt vast wat er op de rekening binnenkomt (digitale stroom).
- **Kaartverkopen** in de app zijn de administratieve **controle**: klopt de omzet met de bank?
- Koppel bankregels waar mogelijk aan een verkoop; anders kun je een regel **afhandelen zonder verkoop** (bijv. terugbetaling) — zie de uitleg op **Financiën**.

## Stappenplan Revolut-import

1. Download het afschrift bij Revolut (CSV).
2. Ga naar **Beheer → Financiën** → Revolut-blok.
3. Kies het **doel** (lunchkraam / avondeten) waar de import onder valt.
4. **Preview** controleren, daarna **Importeren**.
5. Afschrijvingen worden uitgaven op **Boodschappen**; dubbele of verdachte regels komen daar in de **wachtrij** (mogelijke duplicaten), waar je kunt samenvoegen of negeren. Bijschrijvingen verschijnen als bankregels op Financiën om aan kaartverkopen te koppelen.

Voor een vergelijking op basis van het **ruwe afschrift** (zonder alleen de database te vertrouwen) kun je lokaal het hulpprogramma gebruiken:

```bash
DATABASE_URL=… ./revolut-import reconcile jaarafschrift.csv
```

Dat toont per maand **Revolut+** (positieve bedragen), **App_omzet** en **Delta**. Het scherm **Verkoopcontrole** gebruikt dezelfde **Delta = Revolut − app**-definitie, maar haalt de Revolut-kant uit de **geïmporteerde** regels in de database (niet opnieuw uit een CSV-bestand). Kleine verschillen met `reconcile` kunnen door **ontvangstdatum** vs **voltooide datum** op het afschrift.

## Overige correcties (alleen admin)

Onder **Beheer → Financiën** (onderaan) kun je als **admin** **overige correcties** vastleggen: terugbetalingen of verrekeningen die niet in Boodschappen of bij “bank zonder verkoop” passen. Ze tellen **niet** als Revolut-import, maar wél mee in de extra kolommen op **Verkoopcontrole** (“correcties”, “app incl.”). Gebruik een **negatief** bedrag als de app-kant van de vergelijking omlaag moet.

## Verkoopcontrole (in de app)

Onder **Beheer → Verkoopcontrole** zie je per maand:

- **Revolut (import):** som van alle geïmporteerde bankregels met ontvangstdatum in die maand (alle koppel-statussen).
- **App-omzet:** dezelfde maandtotalen als in de andere rapportages (vervulde verkopen in Europe/Amsterdam + **open** bank-omzet uit import).

Statuskolom (vereenvoudigd):

- **Synchroon** — verschil onder een cent.
- **Revolut hoger** — meer import in die maand dan de app-omzet voor die maand (controleer timing en openstaande koppelingen).
- **App hoger** — andersom; bijvoorbeeld verkopen geaccordeerd in deze maand terwijl de bankregel in een andere maand binnenkwam.

## Hulp nodig?

- **Techniek / foutmeldingen:** maintainer van de codebase of issue in het project.
- **Inhoudelijke boekingskeuzes:** afstemmen binnen de vereniging (penningmeester / bestuur).
