# Source Health Policy Lives With Adapter Scopes

The Source Health Matrix judges `source + scope` capabilities rather than whole sources, so health policy belongs with adapter registration instead of only in `sourceCatalog`. This keeps rules such as stale thresholds, empty result behavior and expected signal kinds attached to the runnable adapter scope that actually produces the data, while `sourceCatalog` remains the source-level directory for display, credentials and enablement.
