import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import {
    LuAlertTriangle, LuLogIn, LuMoon, LuSun, LuFolder, LuFilm,
    LuUpload, LuVideo, LuLogOut, LuChevronDown, LuUserCheck,
} from "react-icons/lu";
import { HiOutlineFire, HiOutlineTranslate } from "react-icons/hi";
import {
    match, ProtoButton, screenWidthAbove, screenWidthAtMost,
    HeaderMenuItemDef, HeaderMenuProps, WithHeaderMenu, checkboxMenuItem, useColorScheme,
} from "@opencast/appkit";

import { BREAKPOINT_MEDIUM } from "../../GlobalStyle";
import i18n, { languages } from "../../i18n";
import { Link } from "../../router";
import { User, useUser } from "../../User";
import { ActionIcon, ICON_STYLE } from "./ui";
import CONFIG from "../../config";
import { Spinner } from "../../ui/Spinner";
import { LoginRoute, REDIRECT_STORAGE_KEY } from "../../routes/Login";
import { focusStyle } from "../../ui";
import { ExternalLink } from "../../relay/auth";
import { COLORS } from "../../color";
import { translatedConfig } from "../../util";
import { UploadRoute } from "../../routes/Upload";
import { ManageRoute } from "../../routes/manage";
import { ManageVideosRoute } from "../../routes/manage/Video";



/** User-related UI in the header. */
export const UserBox: React.FC = () => {
    const { t } = useTranslation();
    const user = useUser();

    const iconCss = {
        height: "100%",
        margin: "0 9px",
        fontSize: 22,
        opacity: 0.4,
    };

    let boxContent;
    if (user === "unknown") {
        boxContent = <Spinner css={iconCss} />;
    } else if (user === "error") {
        // TODO: tooltip
        boxContent = <LuAlertTriangle css={iconCss} />;
    } else if (user === "none") {
        boxContent = <LoggedOut />;
    } else {
        boxContent = <LoggedIn {...{ t, user }} />;
    }

    return <>
        <LanguageSettings />
        <ColorSchemeSettings />
        {boxContent}
    </>;
};


/** User-related UI in header when the user is NOT logged in. */
const LoggedOut: React.FC = () => {
    const { t } = useTranslation();

    return (
        <Link
            to={CONFIG.auth.loginLink ?? LoginRoute.url}
            onClick={() => {
                // Store a redirect link in session storage.
                window.sessionStorage.setItem(REDIRECT_STORAGE_KEY, window.location.href);
            }}
            htmlLink={!!CONFIG.auth.loginLink}
            css={{
                /* Show labelled button on larger screens. */
                [screenWidthAbove(BREAKPOINT_MEDIUM)]: {
                    color: COLORS.primary0BwInverted,
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    marginLeft: 4,
                    borderRadius: 8,
                    padding: "7px 14px",
                    backgroundColor: COLORS.primary0,
                    textDecoration: "none",
                    svg: { fontSize: 20 },
                    ":hover, :focus": {
                        backgroundColor: COLORS.primary1,
                        color: COLORS.primary1BwInverted,
                    },
                    ...focusStyle({ offset: 1 }),
                },
                /* Show only the icon on mobile devices. */
                [screenWidthAtMost(BREAKPOINT_MEDIUM)]: {
                    color: COLORS.neutral90,
                    ...ICON_STYLE,
                    span: { display: "none" },
                },
            }}
        >
            <LuLogIn />
            <span>{t("user.login")}</span>
        </Link>
    );
};

/** Header button and associated floating menu to choose between color schemes */
export const ColorSchemeSettings: React.FC = () => {
    const { t } = useTranslation();
    const { scheme, isAuto, update } = useColorScheme();

    const currentPref = isAuto ? "auto" : scheme;
    const choices = ["auto", "light", "dark"] as const;
    const menuItems: HeaderMenuItemDef[] = choices.map(choice => checkboxMenuItem({
        checked: currentPref === choice,
        children: <>{t(`main-menu.color-scheme.${choice}`)}</>,
        onClick: () => update(choice),
    }));

    return (
        <WithHeaderMenu
            menu={{
                label: t("main-menu.color-scheme.label"),
                items: menuItems,
                breakpoint: BREAKPOINT_MEDIUM,
            }}
        >
            <ActionIcon title={t("main-menu.color-scheme.label")}>
                {scheme === "light" ? <LuMoon /> : <LuSun />}
            </ActionIcon>
        </WithHeaderMenu>
    );
};

/** Header button and associated floating menu to choose between languages */
export const LanguageSettings: React.FC = () => {
    const { t, i18n } = useTranslation();
    const isCurrentLanguage = (language: string) => language === i18n.resolvedLanguage;

    const menuItems = Object.keys(languages).map(lng => checkboxMenuItem({
        checked: isCurrentLanguage(lng),
        children: <>{t("general.language.name", { lng })}</>,
        onClick: () => {
            if (!isCurrentLanguage(lng)) {
                i18n.changeLanguage(lng);
            }
        },
    }));

    const label = t("general.language.language_one");
    return (
        <WithHeaderMenu
            menu={{
                label,
                items: menuItems,
                breakpoint: BREAKPOINT_MEDIUM,
            }}
        >
            <ActionIcon title={t("general.language.selection")}>
                <HiOutlineTranslate />
            </ActionIcon>
        </WithHeaderMenu>
    );
};


type LoggedInProps = {
    user: User;
};

/** User-related UI in header when the user IS logged in. */
const LoggedIn: React.FC<LoggedInProps> = ({ user }) => {
    const { t } = useTranslation();

    type LogoutState = "idle" | "pending" | "error";
    const [logoutState, setLogoutState] = useState<LogoutState>("idle");

    const indent = { paddingLeft: 30 };
    const items: HeaderMenuProps["items"] = [
        {
            icon: <LuFolder />,
            wrapper: <Link to={ManageRoute.url} />,
            children: t("user.manage-content"),
            css: { minWidth: 200 },
        },
        ...user.canCreateUserRealm ? [{
            icon: <HiOutlineFire />,
            wrapper: <Link to={`/@${user.username}`} />,
            children: t("realm.user-realm.my-page"),
            css: indent,
        }] : [],
        {
            icon: <LuFilm />,
            wrapper: <Link to={ManageVideosRoute.url} />,
            children: t("manage.my-videos.title"),
            css: indent,
        },
        ...user.canUpload ? [{
            icon: <LuUpload />,
            wrapper: <Link to={UploadRoute.url} />,
            children: t("upload.title"),
            css: indent,
        }] : [],
        ...user.canUseStudio ? [{
            icon: <LuVideo />,
            wrapper: <ExternalLink
                service="STUDIO"
                params={{
                    "return.target": document.location.href,
                    "return.label": translatedConfig(CONFIG.siteTitle, i18n),
                }}
                fallback="link"
            />,
            keepOpenAfterClick: true,
            children: t("manage.dashboard.studio-tile-title"),
            css: { ...indent, width: "100%" },
        }] : [],

        // Logout button
        {
            icon: match(logoutState, {
                "idle": () => <LuLogOut />,
                "pending": () => <Spinner />,
                "error": () => <LuAlertTriangle />,
            }),
            children: t("user.logout"),
            css: {
                color: COLORS.danger0,
                ":hover, :focus": {
                    color: COLORS.danger0,
                },
            },
            ...CONFIG.auth.logoutLink !== null
                ? {
                    wrapper: <Link to={CONFIG.auth.logoutLink} htmlLink />,
                }
                : {
                    keepOpenAfterClick: true,
                    wrapper: <div
                        tabIndex={0}
                        onClick={() => {
                        // We don't do anything if a request is already pending.
                            if (logoutState === "pending") {
                                return;
                            }

                            setLogoutState("pending");
                            fetch("/~session", { method: "DELETE" })
                                .then(() => {
                                // We deliberately ignore the `status`. See `handle_logout`
                                // for more information.
                                //
                                // We hard forward to the home page to get rid of any stale state.
                                    window.location.href = "/";
                                })
                                .catch(error => {
                                // TODO: this is not great. It should happen only
                                // extremely rarely, but still, just showing a triangle
                                // is not very great for the user.
                                // eslint-disable-next-line no-console
                                    console.error("Error during logout: ", error);
                                    setLogoutState("error");
                                });
                        }}
                    />,
                },
        },
    ];

    const menuProps = {
        label: user.displayName,
        breakpoint: BREAKPOINT_MEDIUM,
        items,
    };

    return <WithHeaderMenu menu={menuProps}>
        <div css={{ position: "relative" }}>
            <ProtoButton title={t("user.settings")} css={{
                display: "flex",
                alignItems: "center",
                backgroundColor: COLORS.neutral05,
                border: `1px solid ${COLORS.neutral40}`,
                gap: 12,
                borderRadius: 8,
                padding: "8px 10px 8px 16px",
                cursor: "pointer",
                ":hover": {
                    borderColor: COLORS.neutral25,
                    outline: `2.5px solid ${COLORS.neutral25}`,
                    outlineOffset: -1,
                },
                ":focus-visible": { borderColor: COLORS.focus },
                ...focusStyle({ offset: -1 }),
                [screenWidthAtMost(BREAKPOINT_MEDIUM)]: {
                    display: "none",
                },
            }}>
                <span css={{
                    maxWidth: "clamp(170px, 12vw, 230px)",
                    whiteSpace: "nowrap",
                    textOverflow: "ellipsis",
                    overflow: "hidden",
                }}>
                    {user.displayName}
                </span>
                <LuChevronDown size={20}/>
            </ProtoButton>
            {/* Show icon on mobile devices. */}
            <ActionIcon
                title={t("user.settings")}
                css={{
                    [screenWidthAbove(BREAKPOINT_MEDIUM)]: {
                        display: "none",
                    },
                }}>
                <LuUserCheck css={{ polyline: { stroke: COLORS.happy1 } }}/>
            </ActionIcon>
        </div>
    </WithHeaderMenu>;
};
