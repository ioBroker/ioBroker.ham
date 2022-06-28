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
        marginRight: theme.spacing(-6),
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

        React.useEffect(() => {
            setValue(inputProps.value);
        }, [inputProps.value]);

        const handleFocus = React.useCallback(
            (e) => {
                if (inputProps.onFocus) {
                    inputProps.onFocus(e);
                }
            },
            [inputProps.onFocus]
        );

        const handleBlur = React.useCallback(
            (e) => {
                setValue((v) => v.trim());
                if (inputProps.onBlur) {
                    inputProps.onBlur(e);
                }
            },
            [inputProps.onBlur]
        );

        const handleInput = React.useCallback(
            (e) => {
                setValue(e.target.value);
                if (inputProps.onChange) {
                    inputProps.onChange(e.target.value);
                }
            },
            [inputProps.onChange]
        );

        const handleCancel = React.useCallback(() => {
            setValue('');
            if (onCancelSearch) {
                onCancelSearch();
            }
        }, [onCancelSearch]);

        const handleRequestSearch = React.useCallback(() => {
            if (onRequestSearch) {
                onRequestSearch(value);
            }
        }, [onRequestSearch, value]);

        const handleKeyUp = React.useCallback(
            (e) => {
                if (e.charCode === 13 || e.key === 'Enter') {
                    handleRequestSearch();
                } else if (
                    cancelOnEscape &&
                    (e.charCode === 27 || e.key === 'Escape')
                ) {
                    handleCancel();
                }
                if (inputProps.onKeyUp) {
                    inputProps.onKeyUp(e);
                }
            },
            [handleRequestSearch, cancelOnEscape, handleCancel, inputProps.onKeyUp]
        );

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
                onClick={handleRequestSearch}
                className={`${classes.iconButton} ${classes.searchIconButton} ${value ? classes.iconButtonHidden : ''}`}
                disabled={disabled}
            >
                {React.cloneElement(searchIcon, {
                    classes: { root: classes.icon },
                })}
            </IconButton>
            <IconButton
                onClick={handleCancel}
                className={`${classes.iconButton} ${value ? classes.iconButtonHidden : ''}`}
                disabled={disabled}
            >
                {React.cloneElement(closeIcon, {
                    classes: { root: classes.icon },
                })}
            </IconButton>
        </Paper>;
    }
);

SearchBar.defaultProps = {
    className: '',
    closeIcon: <ClearIcon />,
    disabled: false,
    placeholder: 'Search',
    searchIcon: <SearchIcon />,
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
    /** Override the close icon. */
    closeIcon: PropTypes.node,
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
    /** Override the search icon. */
    searchIcon: PropTypes.node,
    /** Override the inline-styles of the root element. */
    style: PropTypes.object,
    /** The value of the text field. */
    value: PropTypes.string,
};

export default withStyles(styles)(SearchBar);