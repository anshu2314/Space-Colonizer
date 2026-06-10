// Resource State Management System
class ResourceState {
    static defaultResources = {
        fuel: 0, oxygen: 0,
        iron: 0, wood: 0, metal: 0, water: 0
    };

    static defaultTools = {
        wood:  { level: 0, cost: { wood: 30, water: 20, metal: 15 } },
        water: { level: 0, cost: { wood: 20, water: 30, metal: 15 } },
        metal: { level: 0, cost: { wood: 25, water: 20, metal: 20 } }
    };

    static defaultVehicles = { satellites: 3, rovers: 5, landers: 5 };

    static defaultMissions = {
        Moon: {
            satellites: 0, rovers: 0, landers: 0,
            mappingProgress: 0, explorationProgress: 0, mineralProgress: 0,
            colonized: false,
            satelliteGoal: 3, roverGoal: 5, landerGoal: 5,
            activeMissions: []
        },
        Mars: {
            satellites: 0, rovers: 0, landers: 0,
            mappingProgress: 0, explorationProgress: 0, mineralProgress: 0,
            colonized: false,
            satelliteGoal: 4, roverGoal: 6, landerGoal: 6,
            activeMissions: []
        },
        Venus: {
            satellites: 0, rovers: 0, landers: 0,
            mappingProgress: 0, explorationProgress: 0, mineralProgress: 0,
            colonized: false,
            satelliteGoal: 5, roverGoal: 7, landerGoal: 7,
            activeMissions: []
        },
        Mercury: {
            satellites: 0, rovers: 0, landers: 0,
            mappingProgress: 0, explorationProgress: 0, mineralProgress: 0,
            colonized: false,
            satelliteGoal: 3, roverGoal: 4, landerGoal: 4,
            activeMissions: []
        }
    };

    // Planet colonization progression
    static defaultColonization = {
        colonizedPlanets: [],
        availablePlanets: ['Moon', 'Mars']
    };

    // Mission costs (resources consumed when launching with no inventory)
    static missionCosts = {
        satellite: { iron: 20, wood: 20, metal: 15, fuel: 15 },
        rover:     { iron: 30, wood: 25, metal: 20, fuel: 20 },
        lander:    { iron: 40, wood: 30, metal: 25, fuel: 25 }
    };

    // Planet progression order (what unlocks after each colonization)
    static _planetProgression = {
        Moon:    'Venus',
        Mars:    'Venus',
        Venus:   'Mercury',
        Mercury: null
    };

    // Current game state
    static resources   = { ...ResourceState.defaultResources };
    static tools       = JSON.parse(JSON.stringify(ResourceState.defaultTools));
    static vehicles    = { ...ResourceState.defaultVehicles };
    static missions    = JSON.parse(JSON.stringify(ResourceState.defaultMissions));
    static colonization = JSON.parse(JSON.stringify(ResourceState.defaultColonization));

    // ── SAVE ──
    static save() {
        try {
            sessionStorage.setItem('sc_resources',    JSON.stringify(ResourceState.resources));
            sessionStorage.setItem('sc_tools',        JSON.stringify(ResourceState.tools));
            sessionStorage.setItem('sc_vehicles',     JSON.stringify(ResourceState.vehicles));
            sessionStorage.setItem('sc_colonization', JSON.stringify(ResourceState.colonization));
            // missions without activeMissions (not serializable)
            const mc = JSON.parse(JSON.stringify(ResourceState.missions));
            Object.keys(mc).forEach(p => { mc[p].activeMissions = []; });
            sessionStorage.setItem('sc_missions', JSON.stringify(mc));
        } catch(e) { console.error('❌ Save failed:', e); }
    }

    // ── LOAD ──
    static load() {
        try {
            const r  = sessionStorage.getItem('sc_resources');
            const t  = sessionStorage.getItem('sc_tools');
            const v  = sessionStorage.getItem('sc_vehicles');
            const m  = sessionStorage.getItem('sc_missions');
            const c  = sessionStorage.getItem('sc_colonization');

            ResourceState.resources = r
                ? { ...ResourceState.defaultResources, ...JSON.parse(r) }
                : { ...ResourceState.defaultResources };

            ResourceState.tools = t
                ? { ...JSON.parse(JSON.stringify(ResourceState.defaultTools)), ...JSON.parse(t) }
                : JSON.parse(JSON.stringify(ResourceState.defaultTools));

            ResourceState.vehicles = v
                ? { ...ResourceState.defaultVehicles, ...JSON.parse(v) }
                : { ...ResourceState.defaultVehicles };

            if (m) {
                const parsed = JSON.parse(m);
                ResourceState.missions = {};
                Object.keys(ResourceState.defaultMissions).forEach(planet => {
                    ResourceState.missions[planet] = {
                        ...JSON.parse(JSON.stringify(ResourceState.defaultMissions[planet])),
                        ...(parsed[planet] || {}),
                        activeMissions: []
                    };
                });
            } else {
                ResourceState.missions = JSON.parse(JSON.stringify(ResourceState.defaultMissions));
            }

            ResourceState.colonization = c
                ? { ...JSON.parse(JSON.stringify(ResourceState.defaultColonization)), ...JSON.parse(c) }
                : JSON.parse(JSON.stringify(ResourceState.defaultColonization));

            console.log('📂 State loaded. Available:', ResourceState.colonization.availablePlanets,
                        '| Colonized:', ResourceState.colonization.colonizedPlanets);
        } catch(e) {
            console.error('❌ Load failed:', e);
            ResourceState.resources    = { ...ResourceState.defaultResources };
            ResourceState.tools        = JSON.parse(JSON.stringify(ResourceState.defaultTools));
            ResourceState.vehicles     = { ...ResourceState.defaultVehicles };
            ResourceState.missions     = JSON.parse(JSON.stringify(ResourceState.defaultMissions));
            ResourceState.colonization = JSON.parse(JSON.stringify(ResourceState.defaultColonization));
        }
    }

    // ── RESET ──
    static reset() {
        ResourceState.resources    = { ...ResourceState.defaultResources };
        ResourceState.tools        = JSON.parse(JSON.stringify(ResourceState.defaultTools));
        ResourceState.vehicles     = { ...ResourceState.defaultVehicles };
        ResourceState.missions     = JSON.parse(JSON.stringify(ResourceState.defaultMissions));
        ResourceState.colonization = JSON.parse(JSON.stringify(ResourceState.defaultColonization));
        ResourceState.save();
    }

    // ── GENERATE RESOURCES FROM TOOLS (call every second) ──
    static tickTools() {
        let any = false;
        const activeLanders = ResourceState.missions.Moon?.landers || 0;
        
        // Landers generate fuel passively
        if (activeLanders > 0) {
            ResourceState.resources.fuel = (ResourceState.resources.fuel || 0) + activeLanders * 2;
            any = true;
        }

        // Lander upgrades generate other resources (Titanium, Water, Metal)
        Object.entries(ResourceState.tools).forEach(([type, tool]) => {
            if (activeLanders > 0) {
                // Lander baseline slow passive yield is 0.2/sec per active lander, boosted by tool level
                const baseYield = activeLanders * 0.2;
                const upgradedYield = tool.level * activeLanders;
                ResourceState.resources[type] = (ResourceState.resources[type] || 0) + baseYield + upgradedYield;
                any = true;
            }
        });

        if (any) ResourceState.save();
        return any;
    }

    // ── BUY VEHICLE (from shop) ──
    static buyVehicle(vehicleType, costs) {
        let canBuy = true, missing = [];
        Object.entries(costs).forEach(([res, cost]) => {
            if ((ResourceState.resources[res] || 0) < cost) {
                canBuy = false;
                const displayName = res === 'wood' ? 'titanium' : res;
                missing.push(`${displayName}: need ${cost}, have ${Math.floor(ResourceState.resources[res] || 0)}`);
            }
        });
        if (!canBuy) return { success: false, message: `Not enough resources! Missing: ${missing.join(', ')}` };

        Object.entries(costs).forEach(([res, cost]) => { ResourceState.resources[res] -= cost; });
        const key = vehicleType + 's';
        ResourceState.vehicles[key]++;
        ResourceState.save();
        return { success: true, message: `Purchased 1x ${vehicleType}! Inventory: ${ResourceState.vehicles[key]}`, newCount: ResourceState.vehicles[key] };
    }

    // ── LAUNCH MISSION ──
    // freeFromInventory: if true, skip resource deduction (vehicle already removed from inventory by caller)
    static launchMission(planet, type, onProgressUpdate, onComplete, freeFromInventory = false) {
        const mission = ResourceState.missions[planet];
        if (!mission) return { success: false, message: `Unknown planet: ${planet}` };

        if (!freeFromInventory) {
            const costs = ResourceState.missionCosts[type];
            let canLaunch = true, missing = [];
            Object.entries(costs).forEach(([res, cost]) => {
                if ((ResourceState.resources[res] || 0) < cost) {
                    canLaunch = false;
                    const displayName = res === 'wood' ? 'titanium' : res;
                    missing.push(`${displayName}: need ${cost}, have ${Math.floor(ResourceState.resources[res] || 0)}`);
                }
            });
            if (!canLaunch) return { success: false, message: `Not enough resources! Missing: ${missing.join(', ')}` };
            Object.entries(costs).forEach(([res, cost]) => { ResourceState.resources[res] -= cost; });
        }

        const counterMap  = { satellite: 'satellites', rover: 'rovers', lander: 'landers' };
        const progressMap = { satellite: 'mappingProgress', rover: 'explorationProgress', lander: 'mineralProgress' };
        const goalMap     = { satellite: 'satelliteGoal',   rover: 'roverGoal',           lander: 'landerGoal' };

        mission[counterMap[type]]++;
        ResourceState.save();

        const durationMs = 30000;
        const goal       = mission[goalMap[type]];
        const incrementPerSecond = (100 / goal) / 30;
        const progressKey      = progressMap[type];
        const missionId        = Date.now() + '_' + Math.random();
        let ticksRemaining     = 30;

        const intervalId = setInterval(() => {
            ticksRemaining--;
            mission[progressKey] = Math.min(100, mission[progressKey] + incrementPerSecond);
            ResourceState.save();
            if (onProgressUpdate) onProgressUpdate(ResourceState.missions[planet]);
            if (ticksRemaining <= 0) {
                clearInterval(intervalId);
                mission.activeMissions = (mission.activeMissions || []).filter(m => m.id !== missionId);
                ResourceState._checkColonization(planet);
                ResourceState.save();
                if (onComplete) onComplete(ResourceState.missions[planet]);
            }
        }, 1000);

        if (!mission.activeMissions) mission.activeMissions = [];
        mission.activeMissions.push({ id: missionId, intervalId, type });

        return { success: true, message: `${type} mission to ${planet} launched! ETA ~30s`, durationMs, missionId };
    }

    // ── USE VEHICLE FROM INVENTORY ──
    static useVehicleFromInventory(vehicleType) {
        const key = vehicleType + 's';
        if ((ResourceState.vehicles[key] || 0) <= 0) return false;
        ResourceState.vehicles[key]--;
        ResourceState.save();
        return true;
    }

    // ── COLONIZE PLANET (call after 100% reached) ──
    static colonizePlanet(planet) {
        const m = ResourceState.missions[planet];
        if (!m) return;
        m.colonized = true;

        const col = ResourceState.colonization;
        if (!col.colonizedPlanets.includes(planet)) col.colonizedPlanets.push(planet);
        col.availablePlanets = col.availablePlanets.filter(p => p !== planet);

        // Unlock next planet
        const next = ResourceState._planetProgression[planet];
        if (next && !col.colonizedPlanets.includes(next) && !col.availablePlanets.includes(next)) {
            col.availablePlanets.push(next);
            console.log(`🆕 Unlocked: ${next}`);
        }

        ResourceState.save();
        console.log(`🎉 ${planet} colonized! Available: ${col.availablePlanets}`);
    }

    static _checkColonization(planet) {
        const m = ResourceState.missions[planet];
        if (!m) return;
        if (m.mappingProgress >= 100 && m.explorationProgress >= 100 && m.mineralProgress >= 100) {
            m.colonized = true;
        }
    }

    static getColonizationPercent(planet) {
        const m = ResourceState.missions[planet];
        if (!m) return 0;
        return Math.round((m.mappingProgress + m.explorationProgress + m.mineralProgress) / 3);
    }

    // ── TOOL METHODS ──
    static getToolInfo(toolType) {
        const names = { wood: 'Lander Titanium Sifter', water: 'Lander Water Condenser', metal: 'Lander Metal Refiner' };
        const icons = { wood: '💎', water: '💧', metal: '🔩' };
        const activeLanders = ResourceState.missions.Moon?.landers || 0;
        return {
            name: names[toolType] || 'Unknown Upgrade',
            icon: icons[toolType] || '🔧',
            level: ResourceState.tools[toolType]?.level || 0,
            cost: ResourceState.tools[toolType]?.cost || {},
            generationRate: (ResourceState.tools[toolType]?.level || 0) * activeLanders
        };
    }

    static buyTool(toolType) {
        const tool = ResourceState.tools[toolType];
        if (!tool) return { success: false, message: 'Tool not found' };

        let canBuy = true, missing = [];
        Object.entries(tool.cost).forEach(([res, cost]) => {
            if ((ResourceState.resources[res] || 0) < cost) {
                canBuy = false;
                const displayName = res === 'wood' ? 'titanium' : res;
                missing.push(`${displayName}: need ${cost}, have ${Math.floor(ResourceState.resources[res] || 0)}`);
            }
        });
        if (!canBuy) return { success: false, message: `Not enough resources! Missing: ${missing.join(', ')}` };

        Object.entries(tool.cost).forEach(([res, cost]) => { ResourceState.resources[res] -= cost; });
        const oldLevel = tool.level;
        tool.level++;
        Object.keys(tool.cost).forEach(res => {
            tool.cost[res] = Math.floor(tool.cost[res] * 1.5);
        });
        ResourceState.save();
        const activeLanders = ResourceState.missions.Moon?.landers || 0;
        const rate = tool.level * activeLanders;
        return { success: true, message: `${ResourceState.getToolInfo(toolType).name} → Level ${tool.level}! Generates ${rate}/sec`, newLevel: tool.level, generationRate: rate, newCosts: { ...tool.cost } };
    }

    static getUpgradePreview(toolType) {
        const tool = ResourceState.tools[toolType];
        if (!tool) return null;
        const activeLanders = ResourceState.missions.Moon?.landers || 0;
        return {
            currentLevel: tool.level, nextLevel: tool.level + 1,
            currentGeneration: tool.level * activeLanders, nextGeneration: (tool.level + 1) * activeLanders,
            costs: { ...tool.cost },
            canAfford: Object.entries(tool.cost).every(([r, c]) => (ResourceState.resources[r] || 0) >= c)
        };
    }

    static calculateTotalInvestment(toolType) {
        const tool = ResourceState.tools[toolType];
        if (!tool || tool.level === 0) return { wood: 0, water: 0, metal: 0, total: 0 };
        let totalCost = { wood: 0, water: 0, metal: 0 };
        let currentCost = { ...ResourceState.defaultTools[toolType].cost };
        for (let l = 1; l <= tool.level; l++) {
            Object.entries(currentCost).forEach(([r, c]) => { totalCost[r] += c; });
            Object.keys(currentCost).forEach(r => { currentCost[r] = Math.floor(currentCost[r] * 1.5); });
        }
        totalCost.total = totalCost.wood + totalCost.water + totalCost.metal;
        return totalCost;
    }

    static getToolStats(toolType) {
        const totalInvested = ResourceState.calculateTotalInvestment(toolType);
        return {
            totalInvested
        };
    }
}

console.log('🚀 ResourceState v2 loaded');