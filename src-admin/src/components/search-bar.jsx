/*
MIT License

Copyright (c) 2017-2020 Wertarbyte and contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
 */
// Source: https://github.com/TeamWertarbyte/material-ui-search-bar/blob/master/src/components/SearchBar/SearchBar.js
import React from 'react';
import { withStyles } from '@mui/styles';

import PropTypes from 'prop-types';
import IconButton from '@mui/material/IconButton';
import Input from '@mui/material/Input';
import Paper from '@mui/material/Paper';

import ClearIcon from '@mui/icons-material/Clear';
import SearchIcon from '@mui/icons-material/Search';

const styles = (theme) => ({
    root: {
        height: theme.spacing(6),
        display: 'flex',
        justifyContent: 'space-between',
    },
    iconButton: {
        marginTop: 6,
        height: 34,
        color: theme.palette.action.active,
        transform: 'scale(1, 1)',
        transition: theme.transitions.create(['transform', 'color'], {
            duration: theme.transitions.duration.shorter,
            easing: theme.transitions.easing.easeInOut,
        }),
    },
    iconButtonHidden: {
        transform: 'scale(0, 0)',
        '& > $icon': {
            opacity: 0,
        },
    },
    searchIconButton: {
        // marginRight: theme.spacing(-6),
    },
    icon: {
        transition: theme.transitions.create(['opacity'], {
            duration: theme.transitions.duration.shorter,
            easing: theme.transitions.easing.easeInOut,
        }),
    },
    input: {
        width: '100%',
    },
    searchContainer: {
        margin: 'auto 16px',
        width: `calc(100% - ${parseInt(theme.spacing(6 + 4), 10)}px)`, // 6 button + 4 margin
    },
});

/**
 * Material design search bar
 * @see [Search patterns](https://material.io/archive/guidelines/patterns/search.html)
 */
const SearchBar = React.forwardRef(
    (
        {
            cancelOnEscape,
            className,
            classes,
            closeIcon,
            disabled,
            onCancelSearch,
            onRequestSearch,
            searchIcon,
            style,
            ...inputProps
        },
        ref
    ) => {
        const inputRef = React.useRef();
        const [value, setValue] = React.useState(inputProps.value);
        const [timer, setTimer] = React.useState(null);

        React.useEffect(() => {
            setValue(inputProps.value);
        }, [inputProps.value]);

        const handleFocus = React.useCallback(
            e => inputProps.onFocus && inputProps.onFocus(e),
            [inputProps]
        );

        const handleBlur = React.useCallback(
            e => {
                setValue(v => v.trim());
                inputProps.onBlur && inputProps.onBlur(e);
            },
            [inputProps]
        );

        const handleInput = React.useCallback(
            e => {
                setValue(e.target.value);
                inputProps.onChange && inputProps.onChange(e.target.value);
            },
            [inputProps]
        );

        const handleCancel = React.useCallback(() => {
            setValue('');
            onCancelSearch && onCancelSearch();
        }, [onCancelSearch]);

        const handleRequestSearch = React.useCallback(() =>
            onRequestSearch && onRequestSearch(value),
            [onRequestSearch, value]);

        const handleKeyUp = React.useCallback(e => {
            if (e.charCode === 13 || e.key === 'Enter') {
                if (timer) {
                    clearTimeout(timer);
                    setTimer(null);
                }
                handleRequestSearch();
            } else if (cancelOnEscape && (e.charCode === 27 || e.key === 'Escape')) {
                handleCancel();
            } else {
                timer && clearTimeout(timer);
                setTimer(setTimeout(() => {
                    setTimer(null);
                    handleRequestSearch();
                }, 500));
            }

            inputProps.onKeyUp && inputProps.onKeyUp(e);
        },
        [handleRequestSearch, cancelOnEscape, handleCancel, inputProps, timer]);

        React.useImperativeHandle(ref, () => ({
            focus: () => inputRef.current.focus(),
            blur: () => inputRef.current.blur(),
        }));

        return <Paper className={`${classes.root} ${className}`} style={style}>
            <div className={classes.searchContainer}>
                <Input
                    {...inputProps}
                    inputRef={inputRef}
                    onBlur={handleBlur}
                    value={value}
                    onChange={handleInput}
                    onKeyUp={handleKeyUp}
                    onFocus={handleFocus}
                    fullWidth
                    className={classes.input}
                    disableUnderline
                    disabled={disabled}
                />
            </div>
            <IconButton
                size="small"
                onClick={handleRequestSearch}
                className={`${classes.iconButton} ${classes.searchIconButton} ${!value ? classes.iconButtonHidden : ''}`}
                disabled={disabled}
            >
                <SearchIcon />
            </IconButton>
            <IconButton
                size="small"
                onClick={handleCancel}
                className={`${classes.iconButton} ${!value ? classes.iconButtonHidden : ''}`}
                disabled={disabled}
            >
                <ClearIcon />
            </IconButton>
        </Paper>;
    }
);

SearchBar.defaultProps = {
    className: '',
    disabled: false,
    placeholder: 'Search',
    style: null,
    value: '',
};

SearchBar.propTypes = {
    /** Whether to clear search on escape */
    cancelOnEscape: PropTypes.bool,
    /** Override or extend the styles applied to the component. */
    classes: PropTypes.object.isRequired,
    /** Custom top-level class */
    className: PropTypes.string,
    /** Disables text field. */
    disabled: PropTypes.bool,
    /** Fired when the search is cancelled. */
    onCancelSearch: PropTypes.func,
    /** Fired when the text value changes. */
    onChange: PropTypes.func,
    /** Fired when the search icon is clicked. */
    onRequestSearch: PropTypes.func,
    /** Sets placeholder text for the embedded text field. */
    placeholder: PropTypes.string,
    /** Override the inline-styles of the root element. */
    style: PropTypes.object,
    /** The value of the text field. */
    value: PropTypes.string,
};

export default withStyles(styles)(SearchBar);