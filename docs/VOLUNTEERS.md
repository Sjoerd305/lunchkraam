# Handleiding vrijwilligers — financiën & import

Korte gids voor penningmeester en andere vrijwilligers die **Revolut**, **Boodschappen** en **Financiën** in de app gebruiken. Technische diepgang staat in [ARCHITECTURE.md](ARCHITECTURE.md).

## Rollen

- **Admin:** volledig beheer (o.a. accounts, instellingen, alle financiële schermen).
- **Operator:** kraam, betalingswachtrij, en een beperkte set financiële schermen (o.a. Financiën, Boodschappen, **Verkoopcontrole**).

## Waar vind je wat?

| Taak | Scherm in de app |
|------|------------------|
| Saldo uit het Revolut-afschrift (CSV-kolom) | **Beheer → Boodschappen** — bovenaan bij Revolut-import |
| Uitgaven en bonnen, contante kas | **Beheer → Boodschappen** |
| Jaaroverzicht omzet / uitgaven / tosti’s | **Beheer → Jaaroverzichten** |
| Openstaande bankregels koppelen aan een kaartverkoop | **Beheer → Financiën** |
| Maandvergelijking Revolut-import vs app-omzet | **Beheer → Verkoopcontrole** (nieuw) |

## Principe: bank vs app

- **Revolut-import** legt vast wat er op de rekening binnenkomt (digitale stroom).
- **Kaartverkopen** in de app zijn de administratieve **controle**: klopt de omzet met de bank?
- Koppel bankregels waar mogelijk aan een verkoop; anders kun je een regel **afhandelen zonder verkoop** (bijv. terugbetaling) — zie de uitleg op **Financiën**.

## Stappenplan Revolut-import (boodschappen)

1. Download het afschrift bij Revolut (CSV).
2. Ga naar **Boodschappen** → Revolut-blok.
3. Kies het **doel** (lunchkraam / avondeten) waar de import onder valt.
4. **Preview** controleren, daarna **Importeren**.
5. Dubbele of verdachte regels komen in de **wachtrij** (pending reviews) — daar kun je samenvoegen of negeren.

Voor een vergelijking op basis van het **ruwe afschrift** (zonder alleen de database te vertrouwen) kun je lokaal het hulpprogramma gebruiken:

```bash
DATABASE_URL=… ./revolut-import reconcile jaarafschrift.csv
```

Dat toont per maand **Revolut+** (positieve bedragen), **App_omzet** en **Delta**. Het scherm **Verkoopcontrole** gebruikt dezelfde **Delta = Revolut − app**-definitie, maar haalt de Revolut-kant uit de **geïmporteerde** regels in de database (niet opnieuw uit een CSV-bestand). Kleine verschillen met `reconcile` kunnen door **ontvangstdatum** vs **voltooide datum** op het afschrift.

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
