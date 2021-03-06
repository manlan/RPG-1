var RPG = module.exports = {};

Object.merge(RPG,require('./Map.njs'));

var logger = RPG.Log.getLogger('RPG.Universe');

RPG.Universe = new (RPG.UniverseClass = new Class({
    Implements : [Events,Options],
    options : {},
    initialize : function(options) {
	this.setOptions(options)
    },

    /**
     * required options:
     * user
     * character || universeID || universeName
     *
     * optional:
     * character || mapID || mapName
     * tilePoints
     *
     * Returns :
     * callback(universe)
     */
    load : function(options,callback) {
	if (!RPG.Constraints.requiredOptions(options,['user'],logger,callback)){
	    return;
	}

	//check to see if we should attempt to load the universe specified by the characters current location
	if (options.character) {
	    options.mapID = options.character.location.mapID;
	    options.universeID = options.character.location.universeID;
	}

	if (!RPG.Constraints.requiredOptions(options,['universeID'],logger,callback)){
	    return;
	}

	RPG.Mysql.query(
	    'SELECT universeID, universeName, options '+
	    'FROM  universes un ' +
	    'WHERE universe'+(options.universeID?'ID':'Name')+' = ? ' +
	    'AND userID = ?'
	    ,[
	    options['universe'+(options.universeID?'ID':'Name')],
	    options.user.options.userID
	    ],
	    function(err,universeResults) {
		if (err) {
		    options.user.logger.error('Universe Load error: universeID: '+options.universeID+' error: '+ JSON.encode(err));
		    callback({
			error : err
		    });
		} else if (universeResults && universeResults[0]) {
		    var universe = {};
		    var universeResult = universeResults[0];

		    universe.options = Object.merge({
			database : {
			    id : universeResult['universeID']
			}
		    },JSON.decode(universeResult['options'],true));


		    if (!options.mapID && !options.mapName && options.tilePoints) {
			options.mapName = universe.options.settings.activeMap;
		    }
		    options.universe = universe;

		    options.user.logger.trace('Universe Loaded universeID: '+options.universeID);

		    RPG.Map.loadMap(options,function(mapUni){
			if (mapUni.error) {
			    callback(mapUni);
			    return;
			}
			universe = Object.merge(universe,mapUni);
			callback(universe);
		    });
		} else {
		    options.user.logger.trace('Universe Load error universeID: '+options.universeID+' error: Nothing Found.');
		    callback({
			error : 'The universe '+ (options.universeID || options.universeName) +' could not be found for user: '+options.user.options.userID+'.'
		    });
		}
		Object.erase(options,'universeID');
		Object.erase(options,'userID');
	    });
    },

    /**
     * Insert the universe into the database,
     * options :
     * user
     * universe
     *
     *
     * callsback(universe || error)
     */
    store : function(options,callback) {
	if (!RPG.Constraints.requiredOptions(options,['user','universe'],logger,callback)){
	    return;
	}

	if (options.user.storingUniverse) {
	    options.user.logger.trace('Universe Store warning for: '+Object.getFromPath(options,'universe.options.property.universeName')+' error: There is a universe already being saved.');
	    callback({
		error : 'Please allow the current Universe to finish saving.'
	    });
	    return;
	}
	options.user.storingUniverse = true;
	//check dupe name:

	//Check for update or insert
	var db =  options.universe.options.database;
	Object.erase(options.universe.options,'database');//remove the database stuff from the incoming universe

	if (db && db.id) {
	    if (Number.from(db.id) <= 0) {
		options.user.logger.fatal('Universe Store error for: '+Object.getFromPath(options,'universe.options.property.universeName')+' error: universe.options.database.id must be > 0.');
		callback({
		    error : 'The universe ID must be numeric.'
		});
		db = null;
		options.user.storingUniverse = false;
		return;
	    }
	    /**
		 * Update
		 */
	    RPG.Mysql.query(
		'UPDATE universes ' +
		'SET universeName = ?, ' +
		'options = ? ' +
		'WHERE universeID = ? ' +
		'AND userID = ? ',
		[
		options.universe.options.property.universeName,
		JSON.encode(options.universe.options),
		db.id,
		options.user.options.userID
		],
		function(err,info) {
		    if (err) {
			options.user.logger.error('Universe Store Update error: universe: '+Object.getFromPath(options,'universe.options.property.universeName')+' error: '+ JSON.encode(err));
			options.user.storingUniverse = false;
			callback({
			    error : err
			});
		    } else {
			if (info.affectedRows) {
			    options.universe.options.database = db;
			    options.user.logger.trace('Universe Store Update: universe: '+Object.getFromPath(options,'universe.options.property.universeName'));

			    if (options.universe.maps) {
				RPG.Map.storeMap(options, function(universe) {
				    options.user.storingUniverse = false;
				    callback(universe);
				});
			    } else {
				options.user.storingUniverse = false;
				callback(options.universe);
			    }
			    db = null;
			} else {
			    options.user.logger.error('Universe Store Update error: universe: '+Object.getFromPath(options,'universe.options.property.universeName')+' error: Universe not found.');
			    options.user.storingUniverse = false;
			    callback({
				error : 'Could not locate the universe specified'
			    });
			}
		    }
		}
		);

	} else {
	    /**
		 * Insert
		 */
	    RPG.Mysql.query(
		'INSERT INTO universes ' +
		'SET universeName = ?, ' +
		'options = ?,' +
		'created = NOW(),' +
		'userID = ?',
		[
		options.universe.options.property.universeName,
		JSON.encode(options.universe.options),
		options.user.options.userID
		],
		function(err,info) {
		    if (err) {
			options.user.logger.error('Universe Store Update error: universe: '+Object.getFromPath(options,'universe.options.property.universeName')+' error: '+ JSON.encode(err));
			options.user.storingUniverse = false;
			callback({
			    error : err
			});
		    } else {
			if (info.insertId) {

			    options.universe.options = Object.merge({
				database : {
				    id : info.insertId
				}
			    },options.universe.options);

			    options.user.logger.trace('Universe Store Insert: universe: '+Object.getFromPath(options,'universe.options.property.universeName'));

			    if (options.universe.maps) {
				RPG.Map.storeMap(options, function(universe) {
				    options.user.storingUniverse = false;
				    callback(universe);
				});
			    } else {
				options.user.storingUniverse = false;
				callback(options.universe);
			    }
			} else {
			    options.user.logger.error('Universe Store Insert error: universe: '+Object.getFromPath(options,'universe.options.property.universeName')+' error: No Rows Inserted.');
			    options.user.storingUniverse = false;
			    callback({
				error : 'Failed to get newly inserted universe ID :( '
			    });
			}
		    }
		}
		);
	}
    },

    /*
     * Check to see if there is a universe by that name already. Ignores universeID if provided so an update can be performed
     * required options:
     * user
     * universe || universeName
     *
     * optional options
     * universe || universeID
     * tilePoints
     *
     * return
     * callback(dupeName || null if ok)
     */
    checkDupeName : function(options,callback) {
	if (!RPG.Constraints.requiredOptions(options,['user'],logger,callback)){
	    return;
	}

	var uID = options.universeID || Object.getFromPath(options,'universe.options.database.id') || 0;
	var uName = options.universeName || Object.getFromPath(options,'universe.options.property.universeName') || '';

	if (!uName || uName.length < 2) {
	    options.user.logger.trace('Universe Check DupeName warning: universe: '+Object.getFromPath(options,'universe.options.property.universeName')+' error: Min 2 Characters.');
	    callback({
		error : 'Invalid Universe name ' + uName + ' Min: 2 characters.'
	    });
	    return
	}

	RPG.Mysql.query(
	    'SELECT un.universeName ' +
	    'FROM universes un ' +
	    'WHERE un.universeName = ? ' +
	    'AND un.userID = ? ' +
	    'AND un.universeID <> ? '
	    ,
	    [
	    uName,
	    options.user.options.userID,
	    Number.from(uID)//ignore universeID for updates
	    ],
	    function(err,results) {
		if (err) {
		    options.user.logger.error('Universe Check DupeName error: universe: '+Object.getFromPath(options,'universe.options.property.universeName')+' error: '+ JSON.encode(err));
		    callback({
			error : err
		    });
		} else {
		    if (results && results[0] && results[0]['universeName']) {
			options.user.logger.error('Universe Check DupeName error: universe: '+Object.getFromPath(options,'universe.options.property.universeName')+' error: Name taken.');
			callback({
			    error : 'You have a Universe named <b>"'+results[0]['universeName']+'"</b> already.<br>Please choose another name.'
			});
		    } else {
			options.user.logger.trace('Universe Check DupeName: Succes universe: '+Object.getFromPath(options,'universe.options.property.universeName')+' is available.');
			callback(null);
		    }
		}
	    }
	    );
    },

    /**
     * List available user universes
     * requied options:
     * user
     *
     * retuns
     * callback(universes || error)
     *
     */
    list : function(options, callback) {
	if (!RPG.Constraints.requiredOptions(options,['user'],logger,callback)){
	    return;
	}

	RPG.Mysql.query(
	    'SELECT universeID, universeName, options, created, updated, '+
	    '   (SELECT count(1) FROM maptiles WHERE mapID in (SELECT mapID FROM maps WHERE universeID = un.universeID)) as totalArea, ' +
	    '   (SELECT count(1) FROM mapscache WHERE mapID in (SELECT mapID FROM maps WHERE universeID = un.universeID)) as totalObjects, ' +
	    '   (SELECT count(1) FROM maps WHERE universeID = un.universeID) as totalMaps ' +
	    'FROM universes un ' +
	    'WHERE un.userID = ? '+
	    'ORDER BY un.updated DESC'
	    ,
	    [
	    Object.getFromPath(options,'user.options.userID')
	    ],
	    function(err,results) {
		if (err) {
		    options.user.logger.error('Universe Listing error: userID: '+Object.getFromPath(options,'user.options.userID')+'error: '+ JSON.encode(err));
		    callback({
			error : err
		    });
		} else {
		    if (results && results[0]) {
			var universes = {};

			results.each(function(result){
			    universes[result['universeName']] = {
				options : Object.merge({
				    database : {
					id : result['universeID'],
					created : result['created'],
					updated : result['updated'],
					userName : options.user.options.name,
					totalArea : result['totalArea'],
					totalObjects : result['totalObjects'],
					totalMaps : result['totalMaps']
				    }
				},
				JSON.decode(result['options'],true)
				    )
			    };
			});

			options.user.logger.error('Universe Listed '+results.length+' universes for userID: '+Object.getFromPath(options,'user.options.userID'));
			callback(universes);

		    } else {
			options.user.logger.error('Universe Listing error: userID: '+Object.getFromPath(options,'user.options.userID')+'error: None Found.');
			callback({
			    error : 'No universes found.'
			});
		    }
		}
	    }
	    );
    }
}))();