import React from "react";
import { useColorScheme } from "@opencast/appkit";

import { focusStyle } from "../../../../ui";
import { COLORS } from "../../../../color";


type ButtonProps = React.ComponentProps<"button">;

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>((props, ref) => (
    <button
        ref={ref}
        type="button"
        css={{
            display: "flex",
            padding: 6,
            alignItems: "center",
            border: "none",
            color: COLORS.neutral60,
            backgroundColor: "inherit",
            transition: "background-color 0.15s, color 0.15s",
            "&[disabled]": {
                color: COLORS.neutral25,
            },
            "&:not([disabled])": {
                cursor: "pointer",
                "&:hover, &:focus": {
                    backgroundColor: COLORS.neutral10,
                    ...useColorScheme().scheme === "dark" && {
                        backgroundColor: COLORS.neutral15,
                        color: COLORS.neutral80,
                    },
                },
                ...focusStyle({}),
            },
        }}
        {...props}
    />
));

type ButtonGroupProps = React.ComponentProps<"div">;

export const ButtonGroup: React.FC<ButtonGroupProps> = props => (
    <div
        {...props}
        css={{
            fontSize: 18,
            display: "flex",
            alignItems: "center",
            border: `1px solid ${COLORS.neutral25}`,
            borderRadius: 4,
            "& > *": {
                display: "flex",
                color: COLORS.neutral60,
                "&:not(:last-child)": {
                    borderRight: `1px solid ${COLORS.neutral25}`,
                },
                "&:last-child > button": {
                    borderTopRightRadius: 4,
                },
                "&:first-child > button": {
                    borderBottomLeftRadius: 4,
                },
            },
        }}
    />
);
