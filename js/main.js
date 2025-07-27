// main.js (KPI logic improved for first and subsequent updates)
document.addEventListener('DOMContentLoaded', () => {
    const state = {
        data: [],
        categoricalCols: [],
        numericalCols: [],
        ndx: null,
        dimensions: {},
        groups: {},
        charts: {},
        gridApi: null,
        primaryMeasure: null,
        secondaryMeasure: null
    };

    const VIBRANT_COLORS = [
        '#4A55A2', '#7895CB', '#A0BFE0', '#F1C27B', '#FFD89C',
        '#E76161', '#B04759', '#643843', '#87A922', '#C4D7B2'
    ];

    const fileInput = document.getElementById('csv-file-input');
    const configContainer = document.getElementById('config-container');
    const dashboardMain = document.getElementById('dashboard-main');
    const updateBtn = document.getElementById('update-dashboard-btn');
    const resetBtn = document.getElementById('reset-filters-btn');

    fileInput.addEventListener('change', handleFileUpload);
    updateBtn.addEventListener('click', () => {
        initializeDashboard();
        updateKPIs();
    });
    resetBtn.addEventListener('click', resetAllFilters);

    [
        'chart1-dim', 'chart1-measure', 'chart1-type',
        'chart2-dim', 'chart2-measure', 'chart2-type'
    ].forEach(id => {
        document.getElementById(id).addEventListener('change', () => {
            if (state.data.length > 0) {
                initializeDashboard();
                updateKPIs();
            }
        });
    });

    function handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = e => {
            const text = e.target.result;
            const rawData = d3.csvParse(text);
            const headers = rawData.columns;
            state.categoricalCols = [];
            state.numericalCols = [];
            const sampleRow = rawData[0] || {};

            headers.forEach(header => {
                if (header.trim() === '') return;
                const sampleValue = sampleRow[header];
                if (sampleValue && !isNaN(sampleValue) && sampleValue.trim() !== '') {
                    state.numericalCols.push(header);
                } else {
                    state.categoricalCols.push(header);
                }
            });

            state.data = rawData.map(d => {
                const cleanRow = { ...d };
                state.numericalCols.forEach(col => {
                    cleanRow[col] = +d[col] || 0;
                });
                return cleanRow;
            });

            populateConfigUI();
            configContainer.classList.remove('hidden');
            dashboardMain.classList.add('hidden');
        };
        reader.readAsText(file);
    }

    function populateConfigUI() {
        const selectors = [
            { id: 'chart1-dim', options: state.categoricalCols },
            { id: 'chart1-measure', options: state.numericalCols },
            { id: 'chart2-dim', options: state.categoricalCols },
            { id: 'chart2-measure', options: state.numericalCols }
        ];

        selectors.forEach(sel => {
            const selectEl = document.getElementById(sel.id);
            selectEl.innerHTML = sel.options.map(opt => `<option value="${opt}">${opt}</option>`).join('');
        });
    }

    function initializeDashboard() {
        const chart1Dim = document.getElementById('chart1-dim').value;
        const chart1Measure = document.getElementById('chart1-measure').value;
        const chart1Type = document.getElementById('chart1-type').value;
        const chart2Dim = document.getElementById('chart2-dim').value;
        const chart2Measure = document.getElementById('chart2-measure').value;
        const chart2Type = document.getElementById('chart2-type').value;

        if (!chart1Dim || !chart1Measure || !chart2Dim || !chart2Measure) {
            alert('Please select dimension and measure for both charts.');
            return;
        }

        dashboardMain.classList.remove('hidden');
        resetBtn.classList.remove('hidden');

        Object.values(state.charts).forEach(chart => chart.destroy());
        state.charts = {};
        state.dimensions = {};
        state.groups = {};

        state.primaryMeasure = chart1Measure;
        state.secondaryMeasure = chart2Measure;

        state.ndx = crossfilter(state.data);
        state.dimensions.chart1 = state.ndx.dimension(d => d[chart1Dim]);
        state.groups.chart1 = state.dimensions.chart1.group().reduceSum(d => d[chart1Measure]);
        state.dimensions.chart2 = state.ndx.dimension(d => d[chart2Dim]);
        state.groups.chart2 = state.dimensions.chart2.group().reduceSum(d => d[chart2Measure]);

        renderChart('chart1', chart1Dim, chart1Type, chart1Measure);
        renderChart('chart2', chart2Dim, chart2Type, chart2Measure);
        renderGrid(state.data);
    }

    function renderChart(chartId, dimension, type, measure) {
        document.getElementById(`${chartId}-title`).innerText = `${measure} by ${dimension}`;
        const ctx = document.getElementById(chartId).getContext('2d');
        const group = state.groups[chartId];
        const topItems = group.top(Infinity).filter(d => d.value > 0);

        state.charts[chartId] = new Chart(ctx, {
            type: type,
            data: {
                labels: topItems.map(d => d.key),
                datasets: [{
                    label: measure,
                    data: topItems.map(d => d.value),
                    backgroundColor: type === 'bar' ? VIBRANT_COLORS[0] : VIBRANT_COLORS,
                    borderColor: '#fff',
                    borderWidth: type === 'bar' ? 0 : 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                onClick: (event, elements) => {
                    if (elements.length > 0) {
                        const selectedKey = topItems[elements[0].index].key;
                        filterDimension(chartId, selectedKey);
                    }
                },
                plugins: {
                    legend: { display: type !== 'bar', position: 'bottom' }
                }
            }
        });
    }

    function renderGrid(data) {
        const gridDiv = document.querySelector('#myGrid');
        if (state.gridApi) {
            state.gridApi.destroy();
        }

        const columnDefs = Object.keys(data[0] || {}).map(col => ({
            field: col,
            sortable: true,
            filter: 'agTextColumnFilter',
            resizable: true,
            flex: 1
        }));

        const gridOptions = {
            columnDefs,
            rowData: data,
            enableCellTextSelection: true,
            onGridReady: params => state.gridApi = params.api
        };

        new agGrid.Grid(gridDiv, gridOptions);
    }

    function updateKPIs() {
        if (!state.ndx) return;

        const allFiltered = state.ndx.allFiltered();

        const totalEl = document.getElementById('kpi-total-records');
        const filteredEl = document.getElementById('kpi-filtered-records');
        const sumEl = document.getElementById('kpi-sum-value');
        const titleEl = document.getElementById('kpi-sum-title');

        totalEl.innerText = state.ndx.size().toLocaleString();
        filteredEl.innerText = allFiltered.length.toLocaleString();

        if (state.primaryMeasure && state.numericalCols.includes(state.primaryMeasure)) {
            const sum = allFiltered.reduce((acc, d) => acc + (d[state.primaryMeasure] || 0), 0);
            sumEl.innerText = sum.toLocaleString(undefined, { maximumFractionDigits: 0 });
            titleEl.innerText = `Total ${state.primaryMeasure}`;
        } else {
            sumEl.innerText = 'N/A';
            titleEl.innerText = 'Total Value';
        }
    }

    function filterDimension(chartId, selectedKey) {
        state.dimensions[chartId].filter(selectedKey);
        refreshVisuals();
    }

    function resetAllFilters() {
        Object.values(state.dimensions).forEach(dim => dim.filterAll());
        refreshVisuals();
    }

    function refreshVisuals() {
        Object.keys(state.charts).forEach(chartId => {
            const chart = state.charts[chartId];
            const group = state.groups[chartId];
            const topData = group.top(Infinity).filter(d => d.value > 0);
            chart.data.labels = topData.map(d => d.key);
            chart.data.datasets[0].data = topData.map(d => d.value);
            chart.update();
        });

        if (state.gridApi) {
            state.gridApi.setRowData(state.ndx.allFiltered());
        }

        updateKPIs();
    }
});
