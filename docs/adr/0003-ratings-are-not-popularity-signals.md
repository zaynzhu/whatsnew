# Ratings Are Not Popularity Signals

Multi-source ratings are stored as current source-attributed rating observations rather than `PopularitySignal` rows. Ratings have different scales, audience kinds and refresh semantics, and do not carry a chart rank; keeping them separate prevents an IMDb, TMDb, Douban or Rotten Tomatoes score from accidentally affecting Heat, ranking movement, chart history or source-health sampling.
