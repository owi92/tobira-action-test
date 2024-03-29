use juniper::{graphql_object, GraphQLEnum, GraphQLObject, GraphQLUnion, graphql_interface};
use postgres_types::{FromSql, ToSql};

use crate::{
    api::{Context, Id, err::ApiResult, Node, NodeValue},
    auth::AuthContext,
    db::{types::Key, util::{select, impl_from_db}},
    prelude::*,
};
use super::block::{Block, BlockValue, SeriesBlock, VideoBlock};


mod mutations;

pub(crate) use mutations::{
    ChildIndex, NewRealm, RemovedRealm, UpdateRealm, UpdatedRealmName, RealmSpecifier,
};


#[derive(Debug, Clone, Copy, PartialEq, Eq, FromSql, ToSql, GraphQLEnum)]
#[postgres(name = "realm_order")]
pub(crate) enum RealmOrder {
    #[postgres(name = "by_index")]
    ByIndex,
    #[postgres(name = "alphabetic:asc")]
    AlphabeticAsc,
    #[postgres(name = "alphabetic:desc")]
    AlphabeticDesc,
}

#[derive(Debug, GraphQLUnion)]
#[graphql(context = Context)]
pub(crate) enum RealmNameSource {
    Plain(PlainRealmName),
    Block(RealmNameFromBlock),
}

/// A simple realm name: a fixed string.
#[derive(Debug, GraphQLObject)]
#[graphql(context = Context)]
pub(crate) struct PlainRealmName {
    name: String,
}

#[derive(Debug)]
pub(crate) struct RealmNameFromBlock {
    block: Key,
}

/// A realm name that is derived from a block of that realm.
#[graphql_object(Context = Context)]
impl RealmNameFromBlock {
    async fn block(&self, context: &Context) -> ApiResult<RealmNameSourceBlockValue> {
        match BlockValue::load_by_key(self.block, context).await? {
            BlockValue::VideoBlock(b) => Ok(RealmNameSourceBlockValue::VideoBlock(b)),
            BlockValue::SeriesBlock(b) => Ok(RealmNameSourceBlockValue::SeriesBlock(b)),
            _ => unreachable!("block {:?} has invalid type for name source", self.block),
        }
    }
}

#[graphql_interface(Context = Context, for = [SeriesBlock, VideoBlock])]
pub(crate) trait RealmNameSourceBlock: Block {
    // TODO: we repeat the `id` method here from the `Block` and `Node` trait.
    // This should be done in a better way. Since the Octobor 2021 spec,
    // interfaces can implement other interfaces. Juniper will support this in
    // the future.
    fn id(&self) -> Id;
}

impl RealmNameSourceBlock for SeriesBlock {
    fn id(&self) -> Id {
        self.shared.id
    }
}

impl RealmNameSourceBlock for VideoBlock {
    fn id(&self) -> Id {
        self.shared.id
    }
}

impl Block for RealmNameSourceBlockValue {
    fn shared(&self) -> &super::block::SharedData {
        match self {
            Self::SeriesBlock(b) => b.shared(),
            Self::VideoBlock(b) => b.shared(),
        }
    }
}


pub(crate) struct Realm {
    pub(crate) key: Key,
    parent_key: Option<Key>,
    plain_name: Option<String>,
    resolved_name: Option<String>,
    name_from_block: Option<Key>,
    path_segment: String,
    full_path: String,
    index: i32,
    child_order: RealmOrder,
    owner_display_name: Option<String>,
}

impl_from_db!(
    Realm,
    select: {
        realms.{
            id, parent, name, name_from_block, path_segment, full_path, index,
            child_order, resolved_name, owner_display_name,
        },
    },
    |row| {
        Self {
            key: row.id(),
            parent_key: row.parent(),
            plain_name: row.name(),
            resolved_name: row.resolved_name(),
            name_from_block: row.name_from_block(),
            path_segment: row.path_segment(),
            full_path: row.full_path(),
            index: row.index(),
            child_order: row.child_order(),
            owner_display_name: row.owner_display_name(),
        }
    }
);

impl Realm {
    pub(crate) async fn root(context: &Context) -> ApiResult<Self> {
        let (selection, mapping) = select!(child_order);
        let row = context.db
            .query_one(&format!("select {selection} from realms where id = 0"), &[])
            .await?;

        Ok(Self {
            key: Key(0),
            parent_key: None,
            plain_name: None,
            resolved_name: None,
            name_from_block: None,
            path_segment: String::new(),
            full_path: String::new(),
            index: 0,
            child_order: mapping.child_order.of(&row),
            owner_display_name: None,
        })
    }

    pub(crate) async fn load_by_id(id: Id, context: &Context) -> ApiResult<Option<Self>> {
        if let Some(key) = id.key_for(Id::REALM_KIND) {
            Self::load_by_key(key, context).await
        } else {
            Ok(None)
        }
    }

    pub(crate) async fn load_by_key(key: Key, context: &Context) -> ApiResult<Option<Self>> {
        if key.0 == 0 {
            return Ok(Some(Self::root(context).await?));
        }

        let selection = Self::select();
        let query = format!("select {selection} from realms where realms.id = $1");
        context.db
            .query_opt(&query, &[&key])
            .await?
            .map(|row| Self::from_row_start(&row))
            .pipe(Ok)
    }

    pub(crate) async fn load_by_path(mut path: String, context: &Context) -> ApiResult<Option<Self>> {
        // Normalize path: strip optional trailing slash.
        if path.ends_with('/') {
            path.pop();
        }

        // Check for root realm.
        if path.is_empty() {
            return Ok(Some(Self::root(context).await?));
        }

        let selection = Self::select();
        let query = format!("select {selection} from realms where realms.full_path = $1");
        context.db
            .query_opt(&query, &[&path])
            .await?
            .map(|row| Self::from_row_start(&row))
            .pipe(Ok)
    }

    pub(crate) fn is_main_root(&self) -> bool {
        self.key.0 == 0
    }

    pub(crate) fn is_user_realm(&self) -> bool {
        self.full_path.starts_with("/@")
    }

    pub(crate) fn is_user_root(&self) -> bool {
        self.is_user_realm() && self.parent_key.is_none()
    }

    /// Returns the username of the user owning this realm tree IF it is a user
    /// realm. Otherwise returns `None`.
    pub(crate) fn owning_user(&self) -> Option<&str> {
        self.full_path.strip_prefix("/@")?.split('/').next()
    }

    fn can_current_user_edit(&self, context: &Context) -> bool {
        if let Some(owning_user) = self.owning_user() {
            matches!(&context.auth, AuthContext::User(u) if u.username == owning_user)
                || context.auth.is_admin()
        } else {
            // TODO: at some point, we want ACLs per realm
            context.auth.is_moderator(&context.config.auth)
        }
    }

    pub(crate) fn require_write_access(&self, context: &Context) -> ApiResult<()> {
        if !self.can_current_user_edit(context) {
            return Err(context.access_error("realm.no-write-access", |user| format!(
                "write access for page '{}' required, but '{user}' is not allowed to",
                self.full_path,
            )))
        }

        Ok(())
    }
}

impl Node for Realm {
    fn id(&self) -> Id {
        Id::realm(self.key)
    }
}

#[graphql_object(Context = Context, impl = NodeValue)]
impl Realm {
    fn id(&self) -> Id {
        Node::id(self)
    }

    /// The name of this realm or `null` if there is no name (for some reason).
    /// To find out why a realm has no name, you have to check `name_source`
    /// which gives you the raw information about the realm name.
    fn name(&self) -> Option<&str> {
        self.resolved_name.as_deref()
    }

    /// The raw information about the name of the realm, showing where the name
    /// is coming from and if there is no name, why that is. Is `null` for the
    /// root realm, non-null for all other realms.
    fn name_source(&self) -> Option<RealmNameSource> {
        if let Some(name) = &self.plain_name {
            Some(RealmNameSource::Plain(PlainRealmName {
                name: name.clone(),
            }))
        } else if let Some(block) = self.name_from_block {
            Some(RealmNameSource::Block(RealmNameFromBlock { block }))
        } else {
            None
        }
    }

    /// Returns `true` if this is the root of the public realm tree (with path = "/").
    fn is_main_root(&self) -> bool {
        self.is_main_root()
    }

    /// Returns true if this is the root of a user realm tree.
    fn is_user_root(&self) -> bool {
        self.is_user_root()
    }

    /// Returns `true` if this realm is managed by a user (path starting with `/@`).
    fn is_user_realm(&self) -> bool {
        self.is_user_realm()
    }

    fn index(&self) -> i32 {
        self.index
    }

    /// Specifies how the children of this realm should be ordered (e.g. in the
    /// navigation list). That's the responsibility of the frontend.
    fn child_order(&self) -> RealmOrder {
        self.child_order
    }

    /// Returns the trailing segment of this realm's path, without any instances of `/`.
    /// Empty for the main root realm.
    fn path_segment(&self) -> &str {
        &self.path_segment
    }

    /// Returns the full path of this realm. `"/"` for the main root realm.
    /// Otherwise it never has a trailing `/`. For user realms, starts with
    /// `/@`.
    fn path(&self) -> &str {
        if self.key.0 == 0 { "/" } else { &self.full_path }
    }

    /// This is only returns a value for root user realms, in which case it is
    /// the display name of the user who owns this realm. For all other realms,
    /// `null` is returned.
    fn owner_display_name(&self) -> Option<&str> {
        self.owner_display_name.as_deref()
    }

    /// Returns the immediate parent of this realm.
    async fn parent(&self, context: &Context) -> ApiResult<Option<Realm>> {
        match self.parent_key {
            Some(parent_key) => Realm::load_by_key(parent_key, context).await,
            None => Ok(None)
        }
    }

    /// Returns all ancestors between the root realm to this realm
    /// (excluding both, the root realm and this realm). It starts with a
    /// direct child of the root and ends with the parent of `self`.
    async fn ancestors(&self, context: &Context) -> ApiResult<Vec<Realm>> {
        let selection = Self::select().with_renamed_table("realms", "ancestors");
        let query = format!(
            "select {selection} \
                from ancestors_of_realm($1) as ancestors \
                where ancestors.id <> 0",
        );
        context.db
            .query_mapped(&query, &[&self.key], |row| Self::from_row_start(&row))
            .await?
            .pipe(Ok)
    }

    /// Returns all immediate children of this realm. The children are always
    /// ordered by the internal index. If `childOrder` returns an ordering
    /// different from `BY_INDEX`, the frontend is supposed to sort the
    /// children.
    async fn children(&self, context: &Context) -> ApiResult<Vec<Self>> {
        let selection = Self::select();
        let query = format!(
            "select {selection} \
                from realms \
                where realms.parent = $1 \
                order by index",
        );
        context.db
            .query_mapped(
                &query,
                &[&self.key],
                |row| Self::from_row_start(&row),
            )
            .await?
            .pipe(Ok)
    }

    /// Returns the (content) blocks of this realm.
    async fn blocks(&self, context: &Context) -> ApiResult<Vec<BlockValue>> {
        // TODO: this method can very easily lead to an N+1 query problem.
        // However, it is unlikely that we ever have that problem: the frontend
        // will only show one realm at a time, so the query will also only
        // request the blocks of one realm.
        BlockValue::load_for_realm(self.key, context).await
    }

    /// Returns the number of realms that are descendants of this one
    /// (excluding this one). Returns a number ≥ 0.
    async fn number_of_descendants(&self, context: &Context) -> ApiResult<i32> {
        let count = context.db
            .query_one(
                "select count(*) from realms where full_path like $1 || '/%'",
                &[&self.full_path],
            )
            .await?
            .get::<_, i64>(0);

        Ok(count.try_into().expect("number of descendants overflows i32"))
    }

    fn can_current_user_edit(&self, context: &Context) -> bool {
        self.can_current_user_edit(context)
    }

    /// Returns `true` if this realm somehow references the given node via
    /// blocks. Currently, the following rules are used:
    ///
    /// - If `id` refers to a series: returns `true` if the realm has a series
    ///   block with that series.
    /// - If `id` refers to an event: returns `true` if the realm has a video
    ///   block with that video OR if the realm has a series block with that
    ///   event's series.
    /// - Otherwise, `false` is returned.
    async fn references(&self, id: Id, context: &Context) -> ApiResult<bool> {
        if let Some(event_key) = id.key_for(Id::EVENT_KIND) {
            let query = "select exists(\
                select 1 \
                from blocks \
                where realm = $1 and ( \
                    video = $2 or \
                    series = (select series from events where id = $2) \
                )\
            )";
            context.db.query_one(&query, &[&self.key, &event_key])
                .await?
                .get::<_, bool>(0)
                .pipe(Ok)
        } else if let Some(series_key) = id.key_for(Id::SERIES_KIND) {
            let query = "select exists(\
                select 1 from blocks where realm = $1 and series = $2\
            )";
            context.db.query_one(&query, &[&self.key, &series_key])
                .await?
                .get::<_, bool>(0)
                .pipe(Ok)
        } else {
            Ok(false)
        }
    }
}
