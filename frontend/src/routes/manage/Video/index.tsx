import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FiChevronDown, FiChevronLeft, FiChevronRight, FiChevronUp } from "react-icons/fi";
import { graphql, VariablesOf } from "react-relay";

import { ManageNav } from "..";
import { RootLoader } from "../../../layout/Root";
import {
    EventSortColumn,
    SortDirection,
    VideoManageQuery,
    VideoManageQueryResponse,
} from "./__generated__/VideoManageQuery.graphql";
import { makeRoute } from "../../../rauta";
import { loadQuery } from "../../../relay";
import { Link } from "../../../router";
import { NotAuthorized } from "../../../ui/error";
import { Thumbnail } from "../../../ui/Video";
import { keyOfId, match, useTitle } from "../../../util";
import FirstPage from "../../../icons/first-page.svg";
import LastPage from "../../../icons/last-page.svg";
import { Card } from "../../../ui/Card";
import { Description } from "../../../ui/metadata";


export const PATH = "/~manage/videos";

export const ManageVideosRoute = makeRoute(url => {
    if (url.pathname !== PATH) {
        return null;
    }

    const vars = queryParamsToVars(url.searchParams);
    const queryRef = loadQuery<VideoManageQuery>(query, vars);

    return {
        render: () => <RootLoader
            {...{ query, queryRef }}
            nav={() => <ManageNav key={1} active={PATH} />}
            render={data => !data.currentUser
                ? <NotAuthorized />
                : <ManageVideos vars={vars} connection={data.currentUser.myVideos} />
            }
        />,
        dispose: () => queryRef.dispose(),
    };
});

const query = graphql`
    query VideoManageQuery(
        $order: EventSortOrder!,
        $after: Cursor,
        $before: Cursor,
        $first: Int,
        $last: Int,
    ) {
        ...UserData
        currentUser {
            myVideos(order: $order, after: $after, before: $before, first: $first, last: $last) {
                totalCount
                pageInfo {
                    hasNextPage hasPreviousPage
                    startCursor endCursor
                    startIndex endIndex
                }
                items {
                    id title duration thumbnail created updated description
                    tracks { resolution }
                }
            }
        }
    }
`;

type EventConnection = NonNullable<VideoManageQueryResponse["currentUser"]>["myVideos"];
type Events = EventConnection["items"];

type Props = {
    connection: EventConnection;
    vars: VariablesOf<VideoManageQuery>;
};

const LIMIT = 15;

/** Main part of this page */
const ManageVideos: React.FC<Props> = ({ connection, vars }) => {
    const { t } = useTranslation();

    let inner;
    if (connection.items.length === 0 && connection.totalCount === 0) {
        inner = <Card kind="info">{t("manage.my-videos.no-videos-found")}</Card>;
    } else {
        inner = <>
            <PageNavigation {...{ vars, connection }} />
            <div css={{ flex: "1 0 0" }}>
                <EventTable events={connection.items} vars={vars} />
            </div>
            <PageNavigation {...{ vars, connection }} />
        </>;
    }

    const title = t("manage.my-videos.title");
    useTitle(title);

    return (
        <div css={{
            display: "flex",
            flexDirection: "column",
            height: "100%",
            gap: 16,
        }}>
            <h1>{title}</h1>
            {inner}
        </div>
    );
};

const THUMBNAIL_WIDTH = 16 * 8;

type EventTableProps = {
    events: Events;
    vars: VariablesOf<VideoManageQuery>;
};

const EventTable: React.FC<EventTableProps> = ({ events, vars }) => {
    const { t } = useTranslation();

    // We need to know whether the table header is in its "sticky" position to apply a box
    // shadow to indicate that the user can still scroll up. This solution uses intersection
    // observer. Compare: https://stackoverflow.com/a/57991537/2408867
    const [headerSticks, setHeaderSticks] = useState(false);
    const tableHeaderRef = useRef<HTMLTableSectionElement>(null);
    useEffect(() => {
        const tableHeader = tableHeaderRef.current;
        if (tableHeader) {
            const observer = new IntersectionObserver(
                ([e]) => setHeaderSticks(!e.isIntersecting),
                { threshold: [1], rootMargin: "-1px 0px 0px 0px" },
            );

            observer.observe(tableHeader);
            return () => observer.unobserve(tableHeader);
        }
        return () => {};
    });

    return <div css={{ position: "relative" }}>
        <table css={{
            width: "100%",
            borderSpacing: 0,
            tableLayout: "fixed",
            "& > thead": {
                position: "sticky",
                top: 0,
                zIndex: 10,
                backgroundColor: "white",
                "&  > tr > th": {
                    borderBottom: "1px solid var(--grey80)",
                    textAlign: "left",
                    padding: "8px 12px",
                },
                ...headerSticks && {
                    boxShadow: "0 0 20px rgba(0, 0, 0, 0.3)",
                    clipPath: "inset(0px 0px -20px 0px)",
                },
            },
            "& > tbody": {
                "& > tr:hover": {
                    backgroundColor: "var(--grey92)",
                },
                "& > tr:not(:first-child) > td": {
                    borderTop: "1px solid var(--grey80)",
                },
                "& td": {
                    padding: 6,
                    verticalAlign: "top",
                    "&:not(:first-child)": {
                        padding: "8px 12px",
                    },
                },
            },
        }}>
            <colgroup>
                <col span={1} css={{ width: THUMBNAIL_WIDTH + 2 * 6 }} />
                <col span={1} />
                <col span={1} css={{ width: 135 }} />
            </colgroup>

            <thead ref={tableHeaderRef}>
                <tr>
                    <th></th>
                    <ColumnHeader
                        label={t("manage.my-videos.columns.title")}
                        sortKey="TITLE"
                        {...{ vars }}
                    />
                    <ColumnHeader
                        label={t("manage.my-videos.columns.created")}
                        sortKey="CREATED"
                        {...{ vars }}
                    />
                </tr>
            </thead>
            <tbody>
                {events.map(event => <Row key={event.id} event={event} />)}
            </tbody>
        </table>
    </div>;
};

type ColumnHeaderProps = {
    label: string;
    sortKey: EventSortColumn;
    vars: VariablesOf<VideoManageQuery>;
};

const ColumnHeader: React.FC<ColumnHeaderProps> = ({ label, sortKey, vars }) => (
    <th>
        <Link
            to={varsToLink({
                order: {
                    column: sortKey,
                    direction: vars.order.column === sortKey && vars.order.direction === "ASCENDING"
                        ? "DESCENDING"
                        : "ASCENDING",
                },
            })}
            css={{
                display: "inline-flex",
                alignItems: "center",
                cursor: "pointer",
                transition: "color 70ms",
                "& > svg": {
                    marginLeft: 6,
                    fontSize: 22,
                },
                "&:hover": {
                    color: "var(--accent-color)",
                },
            }}
        >
            {label}
            {vars.order.column === sortKey && match(vars.order.direction, {
                "ASCENDING": () => <FiChevronUp />,
                "DESCENDING": () => <FiChevronDown />,
            }, () => null)}
        </Link>
    </th>
);

const Row: React.FC<{ event: Events[number] }> = ({ event }) => {
    const created = new Date(event.created);
    const link = `${PATH}/${keyOfId(event.id)}`;
    const { i18n } = useTranslation();

    return (
        <tr>
            <td>
                <Link to={link}>
                    <Thumbnail event={event} />
                </Link>
            </td>
            <td>
                <div css={{
                    whiteSpace: "nowrap",
                    textOverflow: "ellipsis",
                    overflow: "hidden",
                }}><Link to={link}>{event.title}</Link></div>
                <Description text={event.description} />
            </td>
            <td css={{ fontSize: 14 }}>
                {created.toLocaleDateString(i18n.language)}
                <br />
                <span css={{ color: "var(--grey40)" }}>
                    {created.toLocaleTimeString(i18n.language)}
                </span>
            </td>
        </tr>
    );
};

type PageNavigationProps = {
    connection: EventConnection;
    vars: VariablesOf<VideoManageQuery>;
};

const PageNavigation: React.FC<PageNavigationProps> = ({ connection, vars }) => {
    const { t } = useTranslation();
    const pageInfo = connection.pageInfo;

    return (
        <div css={{
            display: "flex",
            justifyContent: "end",
            alignItems: "center",
            gap: 48,
        }}>
            <div>
                {t("manage.my-videos.page-showing-video-ids", {
                    start: connection.pageInfo.startIndex ?? "?",
                    end: connection.pageInfo.endIndex ?? "?",
                    total: connection.totalCount,
                })}
            </div>
            <div>
                <PageLink
                    vars={{ order: vars.order, first: LIMIT }}
                    disabled={!pageInfo.hasPreviousPage && connection.items.length === LIMIT}
                ><FirstPage /></PageLink>
                <PageLink
                    vars={{ order: vars.order, before: pageInfo.startCursor, last: LIMIT }}
                    disabled={!pageInfo.hasPreviousPage}
                ><FiChevronLeft /></PageLink>
                <PageLink
                    vars={{ order: vars.order, after: pageInfo.endCursor, first: LIMIT }}
                    disabled={!pageInfo.hasNextPage}
                ><FiChevronRight /></PageLink>
                <PageLink
                    vars={{ order: vars.order, last: LIMIT }}
                    disabled={!pageInfo.hasNextPage}
                ><LastPage /></PageLink>
            </div>
        </div>
    );
};

type PageLinkProps = {
    vars: VariablesOf<VideoManageQuery>;
    disabled: boolean;
};

const PageLink: React.FC<PageLinkProps> = ({ children, vars, disabled }) => (
    <Link
        to={varsToLink(vars)}
        css={{
            background: "none",
            border: "none",
            fontSize: 24,
            padding: "4px 4px",
            margin: "0 4px",
            lineHeight: 0,
            ...disabled
                ? {
                    color: "var(--grey80)",
                    pointerEvents: "none",
                }
                : {
                    color: "var(--grey40)",
                    cursor: "pointer",
                    ":hover": {
                        color: "black",
                    },
                },
        }}
    >{children}</Link>
);

const DEFAULT_SORT_COLUMN: EventSortColumn = "CREATED";
const DEFAULT_SORT_DIRECTION: SortDirection = "DESCENDING";

/** Reads URL query parameters and converts them into query variables */
const queryParamsToVars = (queryParams: URLSearchParams): VariablesOf<VideoManageQuery> => {
    // Sort order
    const sortBy = queryParams.get("sortBy");
    const column = sortBy !== null && match<string, EventSortColumn>(sortBy, {
        "title": () => "TITLE",
        "duration": () => "DURATION",
        "created": () => "CREATED",
        "updated": () => "UPDATED",
    });

    const sortOrder = queryParams.get("sortOrder");
    const direction = sortOrder !== null && match<string, SortDirection>(sortOrder, {
        "desc": () => "DESCENDING",
        "asc": () => "ASCENDING",
    });

    const order = !column || !direction
        ? { column: DEFAULT_SORT_COLUMN, direction: DEFAULT_SORT_DIRECTION }
        : { column, direction };

    // Pagination
    if (queryParams.has("lastPage")) {
        return { order, last: LIMIT };
    }
    if (queryParams.has("before")) {
        return { order, before: queryParams.get("before"), last: LIMIT };
    }
    if (queryParams.has("after")) {
        return { order, after: queryParams.get("after"), first: LIMIT };
    }

    return { order, first: LIMIT };
};

/** Converts query variables to URL query parameters */
const varsToQueryParams = (vars: VariablesOf<VideoManageQuery>): URLSearchParams => {
    const searchParams = new URLSearchParams();

    // Sort order
    const isDefaultOrder = vars.order.column === DEFAULT_SORT_COLUMN
        && vars.order.direction === DEFAULT_SORT_DIRECTION;
    if (!isDefaultOrder) {
        searchParams.set("sortBy", vars.order.column.toLowerCase());
        searchParams.set("sortOrder", match(vars.order.direction, {
            "ASCENDING": () => "asc",
            "DESCENDING": () => "desc",
        }, () => ""));
    }

    // Pagination
    if (vars.last !== undefined) {
        if (!vars.before) {
            searchParams.set("lastPage", "");
        } else {
            searchParams.set("before", vars.before);
        }
    } else if (vars.after) {
        searchParams.set("after", vars.after);
    }

    return searchParams;
};

const varsToLink = (vars: VariablesOf<VideoManageQuery>): string => {
    const url = new URL(document.location.href);
    url.search = varsToQueryParams(vars).toString();
    return url.href;
};