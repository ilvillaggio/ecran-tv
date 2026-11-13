# Écran TV — Il Villaggio

Ce que lit l'écran de la TV de la pizzeria :
- `reglages.json` : les réglages. Un changement est pris par la TV dans les 5 minutes.
- `img/` : les photos des desserts, des affiches et des pizzas.
- `appli/` : la dernière version de l'écran (`ecran.html`, `main.js`). La TV la charge à chaque démarrage. Elle se relance seule quand `versionAppli` change dans `reglages.json`.
