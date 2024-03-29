use chrono::{DateTime, NaiveDateTime, Utc, TimeZone};
use tokio_postgres::GenericClient;

use crate::prelude::*;


/// Stored in the database to keep track of the Opencast <-> Tobira sync. For
/// more information, see the DB migration script.
pub(super) struct SyncStatus {
    pub(super) harvested_until: DateTime<Utc>,
}

impl SyncStatus {
    /// Fetches that information from the DB.
    pub(super) async fn fetch(db: &impl GenericClient) -> Result<Self> {
        let row = db.query_one("select harvested_until from sync_status", &[]).await?;

        Ok(Self {
            harvested_until: Utc.from_utc_datetime(&row.get::<_, NaiveDateTime>(0)),
        })
    }

    /// Write a new value for `harvested_until` into the database.
    pub(super) async fn update_harvested_until(
        new_value: DateTime<Utc>,
        db: &impl GenericClient,
    ) -> Result<()> {
        db.execute(
            "update sync_status set harvested_until = $1",
            &[&new_value.naive_utc()],
        ).await?;

        Ok(())
    }
}
