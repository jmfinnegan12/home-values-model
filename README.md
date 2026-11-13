# Home values model

A model from [Event Neutral](https://eventneutral.com): what will Zillow's first published November 2026 home values be in 16 US cities? Built around Kalshi's home value markets (`KXAUSHOME`, `KXSEAHOME` and the others listed on the Rules page).

- `index.html`: the Question page (served at home-values-model.eventneutral.com). `rules/`: the markets' rules, cities, region IDs and strikes.
- `model/`: the interactive Model page, one city at a time, with the center and standard deviation as inputs.
- `data/cities.json`: each city's Zillow history, model center, and the model's distribution (cumulative and density on a grid of log-percent offsets from the center), built from Zillow's files of 2026-10-16 (data through September 2026).
- **Each update:** when Zillow publishes a new month, rebuild `data/cities.json` from the new files and add a line to the Model page's update log.
- The look shared by Event Neutral pages is loaded from `https://eventneutral.com/kit/v1/`. Its source is in the `event-neutral-site` repository.

---

Started 2026-11-11. Nothing here is financial advice.

License: MIT, see [LICENSE](LICENSE).
