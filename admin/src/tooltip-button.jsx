import React from 'react';
import Button from '@material-ui/core/Button';
import Tooltip from '@material-ui/core/Tooltip';
import ToggleButton from '@material-ui/lab/ToggleButton';

export default ({ tooltip, toggle, disabled, Icon, ...other }) => {
    const Btn = toggle ? ToggleButton : Button;
    //const Btn = ToggleButton;
    return !!disabled ? (
        <Btn disabled={true} {...other}>
            <Icon />
        </Btn>
    ) : (
        <Tooltip title={tooltip}>
            <Btn {...other}>
                <Icon />
            </Btn>
        </Tooltip>
    );
};