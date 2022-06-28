import React, { useEffect, useReducer, useState } from 'react';

import { DataTypeProvider, VirtualTableState, Table } from '@devexpress/dx-react-grid';
import { Grid as DxGrid, TableHeaderRow, VirtualTable } from '@devexpress/dx-react-grid-material-ui';

import ButtonGroup from '@mui/material/ButtonGroup';
import Chip from '@mui/material/Chip';
import FormControl from '@mui/material/FormControl';
import Grid from '@mui/material/Grid';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Select from '@mui/material/Select';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';

import Build from '@mui/icons-material/Build';
import DeleteForever from '@mui/icons-material/DeleteForever';
import GetApp from '@mui/icons-material/GetApp';
import HelpOutline from '@mui/icons-material/HelpOutline';
import Update from '@mui/icons-material/Update';

import Confirm from '@iobroker/adapter-react-v5/Dialogs/Confirm';
import I18n from '@iobroker/adapter-react-v5/i18n';

import ConfigDialog from './config-dialog';
import SearchField from './search-field';
import { TabCache } from '../tab-cache';
import TooltipButton from './tooltip-button';

const VIRTUAL_PAGE_SIZE = 50;
const SEARCH_URL = 'https://api.npms.io/v2/search?q=keywords:homebridge-plugin';
const INFO_URL = 'https://api.npms.io/v2/package/mget';
const UNKNOWN_VERSION = '?';
const getRowId = (row) => row.package.name;
const buildQueryString = (skip, take, search) =>
    `${SEARCH_URL}${!!search ? encodeURIComponent(' ' + search) : ''}&from=${skip}&size=${take}`;

const initialState = {
    instances: [],
    rows: [],
    skip: 0,
    requestedSkip: 0,
    take: VIRTUAL_PAGE_SIZE * 2,
    totalCount: 0,
    loading: false,
    lastQuery: '',
    lastAdapterConfigJson: '{}',
    search: '',
    openConfig: undefined,
    confirmDelete: undefined,
};

function reducer(state, { type, payload }) {
    //console.log('reducer', type, payload);
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
        case 'UPDATE_INSTANCES':
            return {
                ...state,
                instances: payload,
            };
        case 'UPDATE_CACHE':
            return {
                ...state,
                lastQuery: payload.query,
                lastAdapterConfigJson: JSON.stringify(payload.adapterConfig),
            };
        case 'EXECUTE_SEARCH':
            return {
                ...state,
                search: payload,
                rows: state.search !== payload ? [] : state.rows,
            };
        case 'OPEN_CONFIG':
            return {
                ...state,
                openConfig: payload.moduleName,
                configReadme: payload.readme,
            };
        case 'INSTALL_CONFIG':
            return {
                ...state,
                installConfig: payload.moduleName,
                configReadme: payload.readme,
            };
        case 'CLOSE_CONFIG':
            return {
                ...state,
                openConfig: undefined,
                installConfig: undefined,
            };
        case 'CONFIRM_DELETE':
            return {
                ...state,
                confirmDelete: payload,
            };
        default:
            return state;
    }
}

const filterKeywords = keyword => {
    return !keyword.includes('homebridge') && !keyword.includes('homekit');
};

const cleanModuleName = (name) => {
    return name
        .replace('homebridge-', '')
        .replace('-homebridge', '')
        .replace(/^@.+?\//, '');
};

const remainderHeight = 'calc(100% - 50px)';
const Root = (props) => <DxGrid.Root {...props} style={{ height: remainderHeight }} />;

export default ({ adapterConfig, socket, instanceId, onChange, showToast, themeType }) => {
    const [state, dispatch] = useReducer(reducer, initialState);
    const [columns] = useState([
        { name: 'name', title: I18n.t('Name'), getCellValue: row => cleanModuleName(row.package.name) },
        { name: 'actions', title: I18n.t('Actions'), getCellValue: row => row },
        { name: 'description', title: I18n.t('Description'), getCellValue: row => row.package.description },
        { name: 'installed', title: I18n.t('Installed'), getCellValue: row => row.installed },
        { name: 'available', title: I18n.t('Available'), getCellValue: row => row.package.version },
        { name: 'keywords', title: I18n.t('Keywords'), getCellValue: row => row.package.keywords.filter(filterKeywords) },
    ]);
    const [tableColumnExtensions] = useState([
        { columnName: 'name', width: 200 },
        { columnName: 'actions', width: 200 },
        { columnName: 'installed', width: 80 },
        { columnName: 'available', width: 80 },
        { columnName: 'keywords', width: 300 },
    ]);
    const LoadingState = React.useCallback(() =>
        <td colSpan={columns.length} style={{ textAlign: 'center', verticalAlign: 'middle' }}>
            <Typography style={{ marginTop: 30, color: themeType === 'dark' ? 'white' : 'black' }}>{I18n.t('No data')}</Typography>
        </td>
    , []);

    adapterConfig._tabCache = adapterConfig._tabCache || {};

    const getRemoteRows = (requestedSkip, take) => {
        dispatch({ type: 'START_LOADING', payload: { requestedSkip, take } });
    };

    const prependInstalled = (results, total, installed, search) => {
        if (!installed || !installed.length) {
            return Promise.resolve({ results, total });
        }

        let filterSearch = () => true;

        if (!!search) {
            const searchTerms = search
                .split(/\s+/)
                .filter((t) => !!t)
                .map((t) => t.toLowerCase());

            filterSearch = item =>
                !searchTerms.filter(t =>
                    !item.package.name.toLowerCase().includes(t) &&
                    !item.package.description.toLowerCase().includes(t) &&
                    !item.package.keywords.filter((k) => k.toLowerCase().includes(t)).length,
                ).length;
        }

        const versions = {};
        const names = [];
        installed
            .map(m => m.split(/(?<!^)@/)) // split on @, but not when it is at the very beginning
            .forEach(parts => {
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
            .then(response => response.json())
            .then(data => {
                const keys = [];
                for (const key in data) {
                    keys.push(key);
                }
                keys.sort();
                results = results.filter(r => !names.includes(r.package.name) && !r.package.name.includes('config-ui-'));
                results.unshift(
                    ...keys
                        .map(k => ({
                            package: data[k].collected.metadata,
                            installed: versions[k] || UNKNOWN_VERSION,
                        }))
                        .filter(filterSearch),
                );
                return { results, total };
            });
    };

    const installed = adapterConfig.libraries.split(/[,;\s]+/).filter(p => !!p);
    const loadData = () => {
        const { requestedSkip, take, search, lastQuery, lastAdapterConfigJson, loading } = state;
        const query = buildQueryString(requestedSkip, take, search);
        if ((query !== lastQuery || JSON.stringify(adapterConfig) !== lastAdapterConfigJson) && !loading) {
            dispatch({ type: 'FETCH_INIT' });
            fetch(query)
                .then(response => response.json())
                .then(({ results, total }) =>
                    prependInstalled(results, total, requestedSkip === 0 ? installed : [], search))
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
            dispatch({ type: 'UPDATE_CACHE', payload: { query, adapterConfig } });
        }
    };

    useEffect(() => loadData());

    const loadInstances = () => {
        const { instances } = state;
        if (instances.length) {
            // only do this once
            return;
        }
        socket.getForeignObjects('system.adapter.ham.*', 'instance')
            .then(objs => {
                const newInstances = Object.keys(objs);
                dispatch({ type: 'UPDATE_INSTANCES', payload: newInstances });
            });
    };

    useEffect(() => loadInstances());

    const PackageNameFormatter = ({ value, row }) => {
        return <Tooltip title={row.package.name}>
            {row.installed ? <strong>{value}</strong> : <Typography>{value}</Typography>}
        </Tooltip>;
    };

    const onConfigureClicked = (row) => {
        const versionPostfix = row.installed === UNKNOWN_VERSION ? '' : `@${row.installed}`;
        dispatch({
            type: 'OPEN_CONFIG',
            payload: {
                moduleName: `${row.package.name}${versionPostfix}`,
                readme: row.package.links.homepage,
            }
        });
    };

    const onUpdateOrInstallClicked = row => {
        const packageRef = `${row.package.name}@${row.package.version}`;
        if (row.installed) {
            const index = installed.findIndex(m => m.startsWith(`${row.package.name}@`) || m === row.package.name);
            if (index !== -1) {
                installed[index] = packageRef;
                showToast(`${row.package.name} will be updated to ${row.package.version}`);
                onChange({ libraries: installed.join(' ') });
            }
        } else {
            dispatch({
                type: 'INSTALL_CONFIG',
                payload: {
                    moduleName: packageRef,
                    readme: row.package.links.homepage,
                }
             });
        }
    };

    const onDeleteClicked = row => {
        dispatch({ type: 'CONFIRM_DELETE', payload: row.package.name });
    };

    const onDeleteConfirmed = ok => {
        const { confirmDelete } = state;
        dispatch({ type: 'CONFIRM_DELETE' }); // closes the dialog by clearing "confirmDelete"
        const index = installed.findIndex((m) => m.startsWith(`${confirmDelete}@`) || m === confirmDelete);
        if (ok && index !== -1) {
            showToast(I18n.t('%s will be removed', confirmDelete));
            const [ removed ] = installed.splice(index, 1);
            const change = { libraries: installed.join(' ') };
            try {
                const tabCache = new TabCache(adapterConfig._tabCache);
                const { configList, configIndex } = tabCache.locateConfig(removed, adapterConfig.wrapperConfig);
                configList.splice(configIndex, 1);
                change.wrapperConfig = adapterConfig.wrapperConfig;
            } catch (e) {
                console.error(`Couldn't delete plugin from wrapperConfig: ${e}`);
            }

            onChange(change);
        }
    };

    const ActionsFormatter = ({ row }) => {
        return <ButtonGroup size="small">
            <TooltipButton tooltip={I18n.t('Readme')} Icon={HelpOutline} target="_blank" href={row.package.links.homepage} />
            <TooltipButton
                tooltip={I18n.t(row.installed ? 'Update' : 'Install')}
                disabled={row.installed && row.installed === row.package.version}
                Icon={row.installed ? Update : GetApp}
                onClick={() => onUpdateOrInstallClicked(row)}
            />
            <TooltipButton
                tooltip={I18n.t('Configure')}
                disabled={!row.installed}
                Icon={Build}
                onClick={() => onConfigureClicked(row)}
            />
            <TooltipButton
                tooltip={I18n.t('Remove')}
                disabled={!row.installed}
                Icon={DeleteForever}
                onClick={() => onDeleteClicked(row)}
            />
        </ButtonGroup>;
    };

    const KeywordsFormatter = ({ value }) => {
        return value.map(k => <Chip key={k} variant="outlined" size="small" label={k} />);
    };

    const onDialogClose = ({ save, wrapperConfig, cache }) => {
        const { installConfig } = state;
        if (save) {
            if (installConfig) {
                installed.push(installConfig);
                showToast(I18n.t('%s will be installed', installConfig));
                onChange({ wrapperConfig, libraries: installed.join(' '), _tabCache: cache });
            } else {
                onChange({ wrapperConfig, _tabCache: cache });
            }
        }

        dispatch({ type: 'CLOSE_CONFIG' });
    };

    const onSwitchInstance = ({ target }) => {
        const parts = target.value.split('.');
        window.location.href = `${window.location.pathname}?${parts[parts.length - 1]}`;
    };

    const isGlobalMode = adapterConfig.useGlobalHomebridge;

    const { rows, skip, totalCount, loading, openConfig, installConfig, configReadme, confirmDelete, instances } = state;
    return <div style={{ height: '100%' }}>
        <Grid container spacing={3}>
            {instances.length > 1 && <Grid item xs={3} md={2} xl={1}>
                <FormControl variant="outlined" fullWidth size="small" style={{ marginTop: 4 }}>
                    <InputLabel id="instanceId-label">{I18n.t('Instance')}</InputLabel>
                    <Select
                        variant="standard"
                        labelId="instanceId-label"
                        id="instanceId"
                        label="Instance"
                        value={instanceId}
                        onChange={(value) => onSwitchInstance(value)}
                    >
                        {instances.map(id => <MenuItem value={id} key={id}>{id.replace('system.adapter.', '')}</MenuItem>)}
                    </Select>
                </FormControl>
            </Grid>}
            <Grid item
                  xs={instances.length > 1 ? 9 : 12}
                  md={instances.length > 1 ? 10 : 12}
                  xl={instances.length > 1 ? 11 : 12}>
                {!isGlobalMode && <SearchField onSearch={(search) => dispatch({ type: 'EXECUTE_SEARCH', payload: search })} />}
            </Grid>
        </Grid>
        <div style={{ flex: '1 1 auto' }}>
            <Paper>
                {!isGlobalMode && <DxGrid rows={rows} columns={columns} getRowId={getRowId} rootComponent={Root}>
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
                    <VirtualTable columnExtensions={tableColumnExtensions} noDataCellComponent={LoadingState}/>
                    <TableHeaderRow />
                </DxGrid>}
                {isGlobalMode && <Grid container spacing={3} style={{ height: remainderHeight, padding: 8 }}>
                    <Grid item xs={12}>
                        <Typography variant="h6" gutterBottom>{I18n.t('Global Mode')}</Typography>
                        <Typography variant="body1" gutterBottom>{I18n.t('global_mode_note')}</Typography>
                    </Grid>
                </Grid>}
            </Paper>
        </div>
        <ConfigDialog
            themeType={themeType}
            moduleName={openConfig || installConfig}
            isNew={!!installConfig}
            readme={configReadme}
            wrapperConfig={adapterConfig.wrapperConfig}
            cache={adapterConfig._tabCache}
            onClose={onDialogClose}
        />
        {confirmDelete && (
            <Confirm text={I18n.t('Do you really want to remove %s', confirmDelete)} onClose={onDeleteConfirmed} />
        )}
    </div>;
};
