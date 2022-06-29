import React from 'react';
import Button from '@mui/material/Button';
import Tooltip from '@mui/material/Tooltip';
import ToggleButton from '@mui/material/ToggleButton';

const TooltipButton = ({ tooltip, toggle, disabled, Icon, ...other }) => {
    const Btn = toggle ? ToggleButton : Button;
    //const Btn = ToggleButton;
    return !!disabled ?
        <Btn disabled={true} {...other}>
            <Icon />
        </Btn>
    :
        <Tooltip title={tooltip}>
            <Btn {...other}>
                <Icon />
            </Btn>
        </Tooltip>;
};

export default TooltipButton;