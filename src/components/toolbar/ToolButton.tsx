import React, {ReactNode} from "react";

import Box from '@mui/joy/Box';
import IconButton from '@mui/joy/IconButton';

type PropsType = {
    icon: () => ReactNode,
    available?: boolean,
    onClick?: any,
}
const ToolButton = (props: PropsType) => (
    <Box sx={{ display: 'flex', flexDirection: 'row', gap: 1.5 }}>
        <IconButton
            size="md"
            variant="soft"
            color={props?.available ? "success": "warning"}
            disabled={!props?.available}
            component="a"
            onClick={props?.onClick}
        >
            {props?.icon()}
        </IconButton>
    </Box>
);

ToolButton.defaultProps = {
    available: true
};

export default ToolButton;
