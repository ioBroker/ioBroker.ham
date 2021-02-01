import { DataTypeProvider, VirtualTableState } from '@devexpress/dx-react-grid';
import { Grid, TableHeaderRow, VirtualTable } from '@devexpress/dx-react-grid-material-ui';
import Button from '@material-ui/core/Button';
import ButtonGroup from '@material-ui/core/ButtonGroup';
import Chip from '@material-ui/core/Chip';
import Paper from '@material-ui/core/Paper';
import Tooltip from '@material-ui/core/Tooltip';
import Typography from '@material-ui/core/Typography';
import Build from '@material-ui/icons/Build';
import DeleteForever from '@material-ui/icons/DeleteForever';
import GetApp from '@material-ui/icons/GetApp';
import HelpOutline from '@material-ui/icons/HelpOutline';
import Update from '@material-ui/icons/Update';
import SearchBar from 'material-ui-search-bar';
import React, { useEffect, useReducer, useState } from 'react';

const VIRTUAL_PAGE_SIZE = 50;
const SEARCH_URL = 'https://api.npms.io/v2/search?q=keywords:homebridge-plugin';
const INFO_URL = 'https://api.npms.io/v2/package/mget';
const getRowId = (row) => row.package.name;
const buildQueryString = (skip, take, search) =>
    `${SEARCH_URL}${!!search ? encodeURIComponent(' ' + search) : ''}&from=${skip}&size=${take}`;

const initialState = {
    rows: [],
    skip: 0,
    requestedSkip: 0,
    take: VIRTUAL_PAGE_SIZE * 2,
    totalCount: 0,
    loading: false,
    lastQuery: '',
    search: '',
};

function reducer(state, { type, payload }) {
    switch (type) {
        case 'UPDATE_ROWS':
            return {
                ...state,
                ...payload,
                loading: false,
            };
        case 'START_LOADING':
            return {
                ...state,
                requestedSkip: payload.requestedSkip,
                take: payload.take,
            };
        case 'REQUEST_ERROR':
            return {
                ...state,
                loading: false,
            };
        case 'FETCH_INIT':
            return {
                ...state,
                loading: true,
            };
        case 'UPDATE_QUERY':
            return {
                ...state,
                lastQuery: payload,
            };
        case 'CHANGE_SEARCH':
            return {
                ...state,
                typingSearch: payload,
            };
        case 'EXECUTE_SEARCH':
            return {
                ...state,
                search: state.typingSearch,
                rows: [],
            };
        case 'CLEAR_SEARCH':
            return {
                ...state,
                search: '',
                rows: state.search ? [] : state.rows,
            };
        default:
            return state;
    }
}

const PackageNameFormatter = ({ value, row }) => {
    return (
        <Tooltip title={row.package.name}>
            {row.installed ? <strong>{value}</strong> : <Typography>{value}</Typography>}
        </Tooltip>
    );
};

const ToolTipButton = ({ tooltip, disabled, Icon, ...other }) => {
    return !!disabled ? (
        <Button disabled={true} {...other}>
            <Icon />
        </Button>
    ) : (
        <Tooltip title={tooltip}>
            <Button {...other}>
                <Icon />
            </Button>
        </Tooltip>
    );
};

const ActionsFormatter = ({ row }) => {
    return (
        <ButtonGroup size="small" aria-label="outlined primary button group">
            <ToolTipButton tooltip="Readme" Icon={HelpOutline} target="_blank" href={row.package.links.homepage} />
            <ToolTipButton
                tooltip={row.installed ? 'Update' : 'Install'}
                disabled={row.installed && row.installed === row.package.version}
                Icon={row.installed ? Update : GetApp}
            />
            <ToolTipButton tooltip="Configure" disabled={!row.installed} Icon={Build} />
            <ToolTipButton tooltip="Delete" disabled={!row.installed} Icon={DeleteForever} />
        </ButtonGroup>
    );
};

const KeywordsFormatter = ({ value }) => {
    return value.map((k) => <Chip key={k} variant="outlined" size="small" label={k} />);
};

const filterKeywords = (keyword) => {
    return keyword.indexOf('homebridge') === -1 && keyword.indexOf('homekit') === -1;
};

const cleanModuleName = (name) => {
    return name
        .replace('homebridge-', '')
        .replace('-homebridge', '')
        .replace(/^@.+?\//, '');
};

export default (props) => {
    const [state, dispatch] = useReducer(reducer, {
        ...initialState,
        installed: (props.installed && props.installed.filter((p) => !!p)) || [],
    });
    const [columns] = useState([
        { name: 'name', title: 'Name', getCellValue: (row) => cleanModuleName(row.package.name) },
        { name: 'actions', title: 'Actions', getCellValue: (row) => row },
        { name: 'description', title: 'Description', getCellValue: (row) => row.package.description },
        { name: 'installed', title: 'Installed', getCellValue: (row) => row.installed },
        { name: 'available', title: 'Available', getCellValue: (row) => row.package.version },
        { name: 'keywords', title: 'Keywords', getCellValue: (row) => row.package.keywords.filter(filterKeywords) },
    ]);
    const [tableColumnExtensions] = useState([
        { columnName: 'name', width: 200 },
        { columnName: 'actions', width: 200 },
        { columnName: 'installed', width: 80 },
        { columnName: 'available', width: 80 },
        { columnName: 'keywords', width: 300 },
    ]);

    const getRemoteRows = (requestedSkip, take) => {
        dispatch({ type: 'START_LOADING', payload: { requestedSkip, take } });
    };

    const prependInstalled = (results, total, installed, search) => {
        if (!installed || installed.length === 0) {
            return Promise.resolve({ results, total });
        }

        let filterSearch = () => true;
        if (!!search) {
            const searchTerms = search
                .split(/\s+/)
                .filter((t) => !!t)
                .map((t) => t.toLowerCase());
            filterSearch = (item) =>
                !searchTerms.filter(
                    (t) =>
                        !item.package.name.toLowerCase().includes(t) &&
                        !item.package.description.toLowerCase().includes(t),
                ).length;
        }

        const versions = {};
        const names = [];
        installed
            .map((m) => m.split('@'))
            .forEach((parts) => {
                names.push(parts[0]);
                versions[parts[0]] = parts[1];
            });

        return fetch(INFO_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
            body: JSON.stringify(names),
        })
            .then((response) => response.json())
            .then((data) => {
                const keys = [];
                for (const key in data) {
                    keys.push(key);
                }
                keys.sort();
                results = results.filter((r) => !names.includes(r.package.name));
                results.unshift(
                    ...keys
                        .map((k) => ({ package: data[k].collected.metadata, installed: versions[k] || '?' }))
                        .filter(filterSearch),
                );
                return { results, total };
            });
    };

    const loadData = () => {
        const { requestedSkip, take, search, lastQuery, loading, installed } = state;
        const showInstalled = requestedSkip === 0 ? installed : [];
        const query = buildQueryString(requestedSkip, take, search);
        if (query !== lastQuery && !loading) {
            dispatch({ type: 'FETCH_INIT' });
            fetch(query)
                .then((response) => response.json())
                .then(({ results, total }) => prependInstalled(results, total, showInstalled, search))
                .then(({ results, total }) => {
                    dispatch({
                        type: 'UPDATE_ROWS',
                        payload: {
                            skip: requestedSkip,
                            rows: results,
                            totalCount: total,
                        },
                    });
                })
                .catch(() => dispatch({ type: 'REQUEST_ERROR' }));
            dispatch({ type: 'UPDATE_QUERY', payload: query });
        }
    };

    useEffect(() => loadData());

    const { rows, skip, totalCount, loading, search } = state;
    return (
        <>
            <SearchBar
                value={search}
                onChange={(newValue) => dispatch({ type: 'CHANGE_SEARCH', payload: newValue })}
                onRequestSearch={() => dispatch({ type: 'EXECUTE_SEARCH' })}
                onCancelSearch={() => dispatch({ type: 'CLEAR_SEARCH' })}
                style={{ marginBottom: '8px' }}
            />
            <Paper>
                <Grid rows={rows} columns={columns} getRowId={getRowId}>
                    <DataTypeProvider formatterComponent={ActionsFormatter} for={['actions']} />
                    <DataTypeProvider formatterComponent={PackageNameFormatter} for={['name']} />
                    <DataTypeProvider formatterComponent={KeywordsFormatter} for={['keywords']} />
                    <VirtualTableState
                        loading={loading}
                        totalRowCount={totalCount}
                        pageSize={VIRTUAL_PAGE_SIZE}
                        skip={skip}
                        getRows={getRemoteRows}
                    />
                    <VirtualTable columnExtensions={tableColumnExtensions} />
                    <TableHeaderRow />
                </Grid>
            </Paper>
        </>
    );
};
