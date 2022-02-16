import React, { useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { graphql, useMutation } from "react-relay";

import { RootLoader } from "../../../layout/Root";
import type {
    AddChildQuery,
    AddChildQueryResponse,
} from "./__generated__/AddChildQuery.graphql";
import { loadQuery } from "../../../relay";
import { useRouter } from "../../../router";
import { useForm } from "react-hook-form";
import { Input } from "../../../ui/Input";
import { Form } from "../../../ui/Form";
import { PathSegmentInput } from "../../../ui/PathSegmentInput";
import { PathInvalid } from ".";
import { boxError, NotAuthorized } from "../../../ui/error";
import { displayCommitError, RealmSettingsContainer, realmValidations } from "./util";
import { Button } from "../../../ui/Button";
import { AddChildMutationResponse } from "./__generated__/AddChildMutation.graphql";
import { Spinner } from "../../../ui/Spinner";
import { Nav } from "../../../layout/Navigation";
import { makeRoute } from "../../../rauta";
import { Card } from "../../../ui/Card";
import { ILLEGAL_CHARS, RESERVED_CHARS } from "../../Realm";


export const PATH = "/~manage/realm/add-child";

export const AddChildRoute = makeRoute(url => {
    if (url.pathname !== PATH) {
        return null;
    }

    const parent = url.searchParams.get("parent");
    if (parent === null) {
        return null;
    }

    const queryRef = loadQuery<AddChildQuery>(query, { parent });

    return {
        render: () => <RootLoader
            {...{ query, queryRef }}
            nav={data => data.parent ? <Nav fragRef={data.parent} /> : []}
            render={data => {
                const parent = data.parent;
                if (!parent) {
                    return <PathInvalid />;
                } else if (!parent.canCurrentUserEdit) {
                    return <NotAuthorized />;
                } else {
                    return <AddChild parent={parent} />;
                }
            }}
        />,
        dispose: () => queryRef.dispose(),
    };
});


const query = graphql`
    query AddChildQuery($parent: String!) {
        ... UserData
        parent: realmByPath(path: $parent) {
            id
            name
            isRoot
            path
            canCurrentUserEdit
            children { path }
            ... NavigationData
        }
    }
`;

const addChildMutation = graphql`
    mutation AddChildMutation($realm: NewRealm!) {
        addRealm(realm: $realm) {
            path
            parent { ...NavigationData }
        }
    }
`;

type Props = {
    parent: NonNullable<AddChildQueryResponse["parent"]>;
};

const AddChild: React.FC<Props> = ({ parent }) => {
    const { t } = useTranslation();

    type FormData = {
        name: string;
        pathSegment: string;
    };

    const { register, handleSubmit, formState: { errors } } = useForm<FormData>();
    const [commitError, setCommitError] = useState<JSX.Element | null>(null);

    const router = useRouter();

    const [commit, isInFlight] = useMutation(addChildMutation);
    const onSubmit = handleSubmit(data => {
        commit({
            variables: {
                realm: {
                    parent: parent.id,
                    name: data.name,
                    pathSegment: data.pathSegment,
                },
            },
            onCompleted: response => {
                const typedResponse = response as AddChildMutationResponse;
                router.goto(`/~manage/realm/content?path=${typedResponse.addRealm.path}`);
            },
            onError: error => {
                setCommitError(displayCommitError(error, t("manage.add-child.failed-to-add")));
            },
        });
    });

    const validations = realmValidations(t);

    return (
        <RealmSettingsContainer>
            <h1>{t("manage.add-child.heading")}</h1>
            <p>
                {
                    parent.isRoot
                        ? t("manage.add-child.below-root")
                        : <Trans
                            i18nKey="manage.add-child.below-this-parent"
                            values={{ parent: parent.name }}
                        >Foo<strong>parent</strong>Bar</Trans>
                }
            </p>
            <Form
                onSubmit={onSubmit}
                css={{
                    margin: "32px 0",
                    "& > div": { marginBottom: 32 },
                }}
            >
                <InputWithInfo info={t("manage.add-child.page-name-info")}>
                    <label htmlFor="name-field">{t("manage.realm.general.rename-label")}</label>
                    <Input
                        id="name-field"
                        css={{ width: 350, maxWidth: "100%" }}
                        placeholder={t("manage.realm.general.rename-label")}
                        error={!!errors.name}
                        {...register("name", validations.name)}
                    />
                    {boxError(errors.name?.message)}
                </InputWithInfo>

                <InputWithInfo
                    info={<Trans i18nKey="manage.add-child.path-segment-info">
                        {{ illegalChars: ILLEGAL_CHARS, reservedChars: RESERVED_CHARS }}
                    </Trans>}
                >
                    <label htmlFor="path-field">{t("manage.add-child.path-segment")}</label>
                    <PathSegmentInput
                        id="path-field"
                        base={parent.path}
                        error={!!errors.pathSegment}
                        {...register("pathSegment", validations.path)}
                    />
                    {boxError(errors.pathSegment?.message)}
                </InputWithInfo>

                <div>
                    <div css={{ display: "flex", alignItems: "center", gap: 16 }}>
                        <Button type="submit" kind="happy" disabled={isInFlight}>
                            {t("manage.add-child.button-create-page")}
                        </Button>
                        {isInFlight && <Spinner size={20} />}
                    </div>
                    {boxError(commitError)}
                </div>
            </Form>
        </RealmSettingsContainer>
    );
};

type InputWithInfoProps = {
    info: JSX.Element;
};

const InputWithInfo: React.FC<InputWithInfoProps> = ({ info, children }) => (
    <div css={{
        display: "flex",
        columnGap: 32,
        rowGap: 16,
        "@media (max-width: 1300px)": {
            flexDirection: "column",
        },
        "& code": {
            whiteSpace: "nowrap",
            borderRadius: 4,
            backgroundColor: "var(--grey92)",
            padding: "2px 4px",
        },
    }}>
        <div css={{ minWidth: "min(100%, 450px)" }}>{children}</div>
        <Card kind="info" css={{ maxWidth: 600, minSize: 100, fontSize: 14 }}>{info}</Card>
    </div>
);