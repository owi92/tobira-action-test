import React, { useRef } from "react";
import { useTranslation } from "react-i18next";
import { graphql, useFragment, commitLocalUpdate, useRelayEnvironment } from "react-relay";
import type { RecordProxy, RecordSourceProxy } from "relay-runtime";
import { FiPlus, FiType, FiGrid, FiFilm, FiHash } from "react-icons/fi";

import { AddButtonsRealmData$key } from "./__generated__/AddButtonsRealmData.graphql";
import { bug } from "../../../../util/err";
import { IconType } from "react-icons";
import {
    Floating,
    FloatingContainer,
    FloatingHandle,
    FloatingTrigger,
    WithTooltip,
} from "../../../../ui/Floating";


type Props = {
    index: number;
    realm: AddButtonsRealmData$key;
};

export const AddButtons: React.FC<Props> = ({ index, realm }) => {
    const { t } = useTranslation();

    const floatingRef = useRef<FloatingHandle>(null);

    const { id: realmId } = useFragment(graphql`
        fragment AddButtonsRealmData on Realm {
            id
        }
    `, realm);

    const env = useRelayEnvironment();

    const addBlock = (
        type: string,
        prepareBlock?: (store: RecordSourceProxy, block: RecordProxy) => void,
    ) => {
        commitLocalUpdate(env, store => {
            const realm = store.get(realmId) ?? bug("could not find realm");

            const blocks = [
                ...realm.getLinkedRecords("blocks") ?? bug("realm does not have blocks"),
            ];

            const id = "clNEWBLOCK";
            const block = store.create(id, `${type}Block`);
            prepareBlock?.(store, block);
            block.setValue(true, "editMode");
            block.setValue(id, "id");

            blocks.splice(index, 0, block);

            realm.setLinkedRecords(blocks, "blocks");
        });
    };

    const BUTTON_SIZE = 36;

    return (
        <FloatingContainer
            ref={floatingRef}
            trigger="click"
            placement="top"
            borderRadius={8}
            distance={6}
            css={{ alignSelf: "center" }}
        >
            <FloatingTrigger>
                <div>
                    <WithTooltip tooltip={t("manage.realm.content.add")} placement="bottom">
                        <div css={{
                            cursor: "pointer",
                            width: BUTTON_SIZE,
                            height: BUTTON_SIZE,
                            fontSize: 24,
                            borderRadius: 4,
                            backgroundColor: "var(--accent-color)",
                            color: "var(--accent-color-bw-contrast)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            "&:hover, &:focus": {
                                backgroundColor: "var(--accent-color-darker)",
                            },
                        }}>
                            <FiPlus />
                        </div>
                    </WithTooltip>
                </div>
            </FloatingTrigger>

            <Floating
                padding={0}
                borderWidth={0}
                shadowBlur={12}
                shadowColor="rgba(0, 0, 0, 30%)"
                css={{
                    backgroundColor: "white",
                    width: 200,
                }}
            >
                <div css={{
                    fontSize: 14,
                    color: "var(--grey40)",
                    padding: "8px 16px",
                    cursor: "default",
                }}>{t("manage.realm.content.add-popup-title")}</div>
                <ul css={{
                    listStyle: "none",
                    margin: 0,
                    padding: 0,
                    "& > li": {
                        "&:not(:last-child)": {
                            borderBottom: "1px solid var(--grey92)",
                        },
                    },
                }}>
                    <AddItem
                        close={() => floatingRef.current?.close()}
                        Icon={FiHash}
                        label={t("manage.realm.content.add-title")}
                        onClick={() => addBlock("Title")}
                    />
                    <AddItem
                        close={() => floatingRef.current?.close()}
                        Icon={FiType}
                        label={t("manage.realm.content.add-text")}
                        onClick={() => addBlock("Text")}
                    />
                    <AddItem
                        close={() => floatingRef.current?.close()}
                        Icon={FiGrid}
                        label={t("manage.realm.content.add-series")}
                        onClick={() => addBlock("Series", (_store, block) => {
                            block.setValue("NEW_TO_OLD", "order");
                            block.setValue(true, "showTitle");
                            block.setValue(false, "showMetadata");
                        })}
                    />
                    <AddItem
                        close={() => floatingRef.current?.close()}
                        Icon={FiFilm}
                        label={t("manage.realm.content.add-video")}
                        onClick={() => addBlock("Video", (_store, block) => {
                            block.setValue(true, "showTitle");
                        })}
                    />
                </ul>
            </Floating>
        </FloatingContainer>
    );
};

type AddItemProps = {
    label: string;
    Icon: IconType;
    onClick: () => void;
    close: () => void;
};

const AddItem: React.FC<AddItemProps> = ({ label, Icon, onClick, close }) => (
    <li>
        <button
            onClick={() => {
                onClick();
                close();
            }}
            css={{
                width: "100%",
                height: "100%",
                padding: "6px 16px",
                display: "flex",
                alignItems: "center",
                gap: 16,
                backgroundColor: "transparent",
                cursor: "pointer",
                border: "none",
                "&:hover, &:focus": {
                    backgroundColor: "var(--grey97)",
                },
            }}
        >
            {<Icon css={{ color: "var(--accent-color)", fontSize: 18 }}/>}
            {label}
        </button>
    </li>
);
