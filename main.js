// ------------------ INCLUDES -------------------------

require('dotenv').config();

console.log(process.env);
const express = require('express');
const app = express();
const {Datastore} = require('@google-cloud/datastore');
const request = require('request');
const datastore = new Datastore();
const cors = require('cors');

const jwt = require('express-jwt');
const jwksRsa = require('jwks-rsa');

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const DOMAIN = 'cs493-291619.us.auth0.com';
const URL = 'https://final-dot-cs493-291619.wl.r.appspot.com/';
const PORT = process.env.PORT || 8080;

app.use(cors());

app.use(express.json());

// ------------------ FUNCTIONS -------------------------

function checkJwt(){
  return [jwt({
    secret: jwksRsa.expressJwtSecret({
      cache: true,
      rateLimit: true,
      jwksRequestsPerMinute: 5,
      jwksUri: `https://${DOMAIN}/.well-known/jwks.json`
    }),
  
    // Validate the audience and the issuer.
    issuer: `https://${DOMAIN}/`,
    algorithms: ['RS256']
  }),function(err,req,res,next){
    if(req.url == '/playlists' && req.method == "GET"){
      const accepts = req.accepts(['application/json']);
      if(!accepts){
        res
        .status(406)
        .send({Error:"Not Acceptable"})
        .end();
      }else{
        var offset = 0;
        if(req.query.page != null){
          offset = 5 * (req.query.page - 1);
        }
        const query = datastore  
        .createQuery('playlist')
        .filter("public",true)
        .offset(offset);
          
        datastore.runQuery(query).then(raws => {
          var entities = raws[0];
          if(entities.length >= 6){
            const next = URL + "playlists?page="+((offset/5)+2);
            var sliced = entities.slice(0,5);
            res
            .status(200)
            .send({total:entities.length + offset,playlists:sliced,next:next})
            .end();
          }else{
            res
            .status(200)
            .send({total:entities.length + offset,playlists:entities})
            .end();
          }
        }); 
      }
    }else if(req.url.includes('/playlists/') && req.method == "GET"){
      const querykey = datastore.key(['playlist',parseInt(req.params.playlistid,10)]);
      const accepts = req.accepts(['application/json']);
      datastore.get(querykey, (err,entity) => {
        if (err){
          res.status(404).send({Error:"No playlist with this playlist_id exists"}).end();
        }else if (entity == null){
          res.status(404).send({Error:"No playlist with this playlist_id exists"}).end();
        }else if (entity.public == false){
          res.status(403).send({Error:"You do not have permission to view this playlist"}).end();
        }else{
          if(!accepts){
            res
            .status(406)
            .send({Error:"Not Acceptable"})
            .end();
          }else if(accepts == 'application/json'){
            res
            .status(200)
            .json({
              id:querykey.id,
              name:entity.name,
              description:entity.description,
              numsongs:entity.numsongs,
              songs:entity.songs,
              public:entity.public,
              owner:entity.owner,
              self:URL + "playlists/"+querykey.id})
            .end();
          }else{
            res
            .status(500)
            .send("Unknown error with content type, try again in 30 seconds")
            .end();
          }
        }
      });
    }else{
      res.status(401).send({Error:"JWT Missing or Invalid"});
    }
  }]
}

function clearPlaylist(playlistid, songid){
  const querykey = datastore.key(['playlist',parseInt(playlistid,10)]);
  datastore.get(querykey, (err,entity) => {
    if(err || entity == null){
      return;
    }
    var new_songs = [];
    entity.songs.forEach(song => {
      if(song.id != songid){
        new_songs.push(song);
      }
    });
    
    const newPlaylist = {
      name : entity.name,
      description : entity.description,
      numsongs : new_songs.length,
      songs : new_songs,
      public : entity.public,
      owner : entity.owner
    };

    const playlistEntity = {
      key : querykey,
      data : newPlaylist
    };

    datastore.update(playlistEntity);
  });
}

const isValidArray = function(a) {
  if((!!a) && (a.constructor === Array)){
    if(a.length == 0){
      return true;
    }else{
      return a.filter(x => x === "").length === 0;
    }
  }
  return false;
};

// ------------------ API ROUTERS -------------------------

// -- USER --

app.get('/users', (req,res) => {
  const accepts = req.accepts(['application/json']);
  if (!accepts){
    res
    .status(406)
    .send({Error:"Not Acceptable"})
    .end();
  }else{
    var offset = 0;
    if(req.query.page != null){
      offset = 5 * (req.query.page - 1);
    }
    const query = datastore  
    .createQuery('user')
    .limit(6)
    .offset(offset);
      
    datastore.runQuery(query).then(raws => {
      var entities = raws[0];
      if(entities.length == 6){
        const next = URL + "users?page="+((offset/5)+2);
        var sliced = entities.slice(0,5);
        res
        .status(200)
        .send({users:sliced,next:next})
        .end();
      }else{
        res
        .status(200)
        .send({users:entities})
        .end();
      }
    });
  }
});

app.get('/users/:userid', (req,res) => {
  const usrquery = datastore.createQuery('user')
  .filter("uid",req.params.userid)
  .limit(1);

  const accepts = req.accepts(['application/json']);

  datastore.runQuery(usrquery).then(raws => {
    var user = raws[0][0];
    if (user == null){
      res.status(404).send({Error:"No user with this user_id exists"}).end();
    }else{
      if(!accepts){
        res
        .status(406)
        .send({Error:"Not Acceptable"})
        .end();
      }else if(accepts == 'application/json'){
        res
        .status(200)
        .json({
          id:user[datastore.KEY].id,
          email:user.email,
          username:user.username,
          joindate:user.joindate,
          uid:user.uid,
          self:URL+"users/"+user.uid})
        .end();
      }else{
        res
        .status(500)
        .send("Unknown error with content type, try again in 30 seconds")
        .end();
      }
    }
  });
});

// -- SONGS --

app.post('/songs', checkJwt(), (req,res) => {
  if(req.get('content-type')!= 'application/json'){
    res
    .status(415)
    .send({Error: "Only application/json data is accepted"})
    .end();
  }
  if (Object.keys(req.body).length != 6){
    res
    .status(400)
    .send({Error : "Number of attributes is invalid" })
    .end();
  }
  if (
  typeof req.body.name != "string" || typeof req.body.artist != "string" || typeof req.body.length != "number" || typeof req.body.bpm != "number" ||
  req.body.name.length < 1 || req.body.artist.length < 1 || req.body.length <= 0 || req.body.bpm <= 0
  || !isValidArray(req.body.vocals) || !isValidArray(req.body.genres)
  ){
    res
    .status(400)
    .send({Error : "One or more of the required attributes is invalid" })
    .end();
  }else{
    const query = datastore.createQuery('song');

    datastore.runQuery(query).then(raws => {
      var entities = raws[0];
      var valid = true;
      entities.forEach(element => {
        if(element.name == req.body.name && element.artist == req.body.artist){
          valid = false;
          res
          .status(403)
          .send({Error : "Song is already in the database" })
          .end();
        }
      });
      if(valid){
        const song = {
          name : req.body.name,
          artist : req.body.artist,
          length : req.body.length,
          bpm : req.body.bpm,
          vocals : req.body.vocals,
          genres : req.body.genres
        };
        const songkey = datastore.key('song');
        const songEntity = {
          key : songkey,
          data : song
        };
        datastore.upsert(songEntity).then(() => {
          res
          .status(201)
          .json({
            id:songkey.id,
            name:song.name,
            artist:song.artist,
            length:song.length,
            bpm:song.bpm,
            vocals:song.vocals,
            genres:song.genres,
            self:URL + "songs/"+songkey.id
          })
          .end();
        }).catch(() => {
          res
          .status(500)
          .send({Error : "Unknown server error" })
          .end();
        }); 
      }
    });
  }
});

app.get('/songs', (req,res) => {
  const accepts = req.accepts(['application/json']);
  if (!accepts){
    res
    .status(406)
    .send({Error:"Not Acceptable"})
    .end();
  }else{
    var offset = 0;
    if(req.query.page != null){
      offset = 5 * (req.query.page - 1);
    }
    const query = datastore  
    .createQuery('song')
    .offset(offset);
      
    datastore.runQuery(query).then(raws => {
      var entities = raws[0];
      if(entities.length >= 6){
        const next = URL + "songs?page="+((offset/5)+2);
        var sliced = entities.slice(0,5);
        res
        .status(200)
        .send({total:offset + entities.length,songs:sliced,next:next})
        .end();
      }else{
        res
        .status(200)
        .send({total:offset + entities.length,songs:entities})
        .end();
      }
    });
  }
});

app.get('/songs/:songid', (req,res) => {
  const querykey = datastore.key(['song',parseInt(req.params.songid,10)]);
  const accepts = req.accepts(['application/json']);
  datastore.get(querykey, (err,entity) => {
    if (err){
      res.status(404).send({Error:"No song with this song_id exists"}).end();
    }else if (entity == null){
      res.status(404).send({Error:"No song with this song_id exists"}).end();
    }else{
      if(!accepts){
        res
        .status(406)
        .send({Error:"Not Acceptable"})
        .end();
      }else if(accepts == 'application/json'){
        res
        .status(200)
        .json({
          id:querykey.id,
          name:entity.name,
          artist:entity.artist,
          length:entity.length,
          bpm:entity.bpm,
          vocals:entity.vocals,
          genres:entity.genres,
          self:URL + "songs/"+querykey.id})
        .end();
      }else{
        res
        .status(500)
        .send("Unknown error with content type, try again in 30 seconds")
        .end();
      }
    }
  });

});

app.put('/songs/:songid', checkJwt(), (req,res) => {
  const querykey = datastore.key(['song',parseInt(req.params.songid,10)]);
  if(req.get('content-type')!= 'application/json'){
    res
    .status(415)
    .send({Error: "Only application/json data is accepted"})
    .end();
  }
  if (Object.keys(req.body).length != 6){
    res
    .status(400)
    .send({Error : "Number of attributes is invalid" })
    .end();
  }
  if (
  typeof req.body.name != "string" || typeof req.body.artist != "string" || typeof req.body.length != "number" || typeof req.body.bpm != "number" ||
  req.body.name.length < 1 || req.body.artist.length < 1 || req.body.length <= 0 || req.body.bpm <= 0
  || !isValidArray(req.body.vocals) || !isValidArray(req.body.genres)
  ){
    res
    .status(400)
    .send({Error : "One or more of the required attributes is invalid" })
    .end();
  }else{
    datastore.get(querykey, (err,entity) => {
      if (err){
        res.status(404).send({Error:"No song with this song_id exists"}).end();
      }else if (entity == null){
        res.status(404).send({Error:"No song with this song_id exists"}).end();
      }else{
        const query = datastore.createQuery('song');

        datastore.runQuery(query).then(raws => {
          var entities = raws[0];
          var valid = true;
          entities.forEach(element => {
            if(element.name == req.body.name && element.artist == req.body.artist){
              valid = false;
              res
              .status(403)
              .send({Error : "Song is already in the database" })
              .end();
            }
          });
          if(valid){
            const song = {
              name : req.body.name,
              artist : req.body.artist,
              length : req.body.length,
              bpm : req.body.bpm,
              vocals : req.body.vocals,
              genres : req.body.genres
            };
            const songEntity = {
              key : querykey,
              data : song
            };
            datastore.update(songEntity).then(() => {
              res
              .status(200)
              .json({
                id:querykey.id,
                name:song.name,
                artist:song.artist,
                length:song.length,
                bpm:song.bpm,
                vocals:song.vocals,
                genres:song.genres,
                self:URL + "songs/"+querykey.id})
              .end();
            }).catch(() => {
              res
              .status(500)
              .send({Error : "Unknown server error" })
              .end();
            });
          }
        });
      }
    });
  }
});

app.patch('/songs/:songid',checkJwt(), (req,res) => {
  const querykey = datastore.key(['song',parseInt(req.params.songid,10)]);
  if(req.get('content-type')!= 'application/json'){
    res
    .status(415)
    .send({Error: "Only application/json data is accepted"})
    .end();
  }
  if (Object.keys(req.body).length > 6 || Object.keys(req.body).length < 1){
    res
    .status(400)
    .send({Error : "Number of attributes is invalid" })
    .end();
  }
  var nameTaken = false;
  var artistTaken = false;
  var bpmTaken = false;
  var lengthTaken = false;
  var genresTaken = false;
  var vocalsTaken = false;
  var isValid = true;
  var values = {};
  Object.keys(req.body).forEach(element => {
    if (element == "name" && !nameTaken){
      if (typeof req.body.name != "string"  || req.body.name.length < 1){
        isValid = false;
      }else{
        values["name"] = req.body.name;
        nameTaken = true; 
      }
    }else if(element == "artist" && !artistTaken){
      if (typeof req.body.artist != "string" || req.body.artist.length < 1){
        isValid = false;
      }else{
        values["artist"] = req.body.artist;
        artistTaken = true;
      }
    }else if(element == "length" && !lengthTaken){
      if (typeof req.body.length != "number" || req.body.length <= 0){
        isValid = false;
      }else{
        values["length"] = req.body.length;
        lengthTaken = true;
      }
    }else if(element == "bpm" && !bpmTaken){
      if (typeof req.body.bpm != "number" || req.body.bpm <= 0){
        isValid = false;
      }else{
        values["bpm"] = req.body.bpm;
        bpmTaken = true;
      }
    }else if(element == "genres" && !genresTaken){
      if (!isValidArray(req.body.genres)){
        isValid = false;
      }else{
        values["genres"] = req.body.genres;
        genresTaken = true;
      }
    }else if(element == "vocals" && !vocalsTaken){
      if (!isValidArray(req.body.vocals)){
        isValid = false;
      }else{
        values["vocals"] = req.body.vocals;
        vocalsTaken = true;
      }
    }else{
      isValid = false;
    }
  });
  if(isValid){
    datastore.get(querykey, (err,entity) => {
      if (err){
        res.status(404).send({Error:"No song with this song_id exists"}).end();
      }else if (entity == null){
        res.status(404).send({Error:"No song with this song_id exists"}).end();
      }else{
        const query = datastore.createQuery('song');
  
        datastore.runQuery(query).then(raws => {
          var entities = raws[0];
          var valid = true;
          entities.forEach(element => {
            if(element.name == req.body.name && element.artist == req.body.artist){
              valid = false;
              res
              .status(403)
              .send({Error : "Song is already in the database" })
              .end();
            }
          });
          if(valid){
            var song = {
              name : entity.name,
              artist : entity.artist,
              length : entity.length,
              bpm : entity.bpm,
              vocals : entity.vocals,
              genres : entity.genres
            };

            Object.keys(values).forEach(element => {
              song[element] = values[element];
            });

            const songEntity = {
              key : querykey,
              data : song
            };
            datastore.update(songEntity).then(() => {
              res
              .status(200)
              .json({
                id:querykey.id,
                name:song.name,
                artist:song.artist,
                length:song.length,
                bpm:song.bpm,
                vocals:song.vocals,
                genres:song.genres,
                self:URL + "songs/"+querykey.id})
              .end();
            }).catch(() => {
              res
              .status(500)
              .send({Error : "Unknown server error" })
              .end();
            });
          }
        });
      }
    });
  }else{
    res
    .status(400)
    .send({Error : "One or more of the required attributes is invalid" })
    .end();
  }
});


app.delete('/songs/:songid', checkJwt(), (req,res) => {
  const querykey = datastore.key(['song',parseInt(req.params.songid,10)]);
  datastore.get(querykey, (err,entity) => {
    if (err){
      res.status(404).send({Error:"No song with this song_id exists"}).end();
    }else if (entity == null){
      res.status(404).send({Error:"No song with this song_id exists"}).end();
    }else{
      const playlistQuery = datastore.createQuery('playlist');
      datastore.runQuery(playlistQuery).then(raws => {
        var entities = raws[0];
        entities.forEach(entity => {
          clearPlaylist(entity[datastore.KEY].id,req.params.songid);
        });
        datastore.delete(querykey).then(() => {
          res.sendStatus(204);
        });
      });
    }
  });
});

// ------------------ PLAYLISTS -------------------------

app.post('/playlists', checkJwt(), (req,res) => {
  if(req.get('content-type')!= 'application/json'){
    res
    .status(415)
    .send({Error: "Only application/json data is accepted"})
    .end();
  }
  if (Object.keys(req.body).length != 3){
    res
    .status(400)
    .send({Error : "Number of attributes is invalid" })
    .end();
  }
  if (
  typeof req.body.name != "string" || typeof req.body.description != "string" || typeof req.body.public != "boolean" ||
  req.body.name.length < 1 || req.body.description.length < 1)
  {
    res
    .status(400)
    .send({Error : "One or more of the required attributes is invalid" })
    .end();
  }else{
    const playlist = {
      name : req.body.name,
      description : req.body.description,
      numsongs : 0,
      songs : [],
      public : req.body.public,
      owner : req.user.sub
    };
    const playlistkey = datastore.key('playlist');
    const playlistEntity = {
      key : playlistkey,
      data : playlist
    };
    datastore.upsert(playlistEntity).then(() => {
      res
      .status(201)
      .json({
        id:playlistkey.id,
        name:playlist.name,
        description:playlist.description,
        numsongs:playlist.numsongs,
        songs:playlist.songs,
        public:playlist.public,
        owner:playlist.owner,
        self:URL + "playlists/"+playlistkey.id})
      .end();
    }).catch(() => {
      res
      .status(500)
      .send({Error : "Unknown server error" })
      .end();
    }); 
  }

});

app.get('/playlists', checkJwt(), (req,res) => {
  const accepts = req.accepts(['application/json']);
  if (!accepts){
    res
    .status(406)
    .send({Error:"Not Acceptable"})
    .end();
  }else{
    var offset = 0;
    if(req.query.page != null){
      offset = 5 * (req.query.page - 1);
    }
    const query = datastore  
    .createQuery('playlist')
    .filter("owner",req.user.sub)
    .offset(offset);
      
    datastore.runQuery(query).then(raws => {
      var entities = raws[0];
      if(entities.length >= 6){
        const next = URL + "playlists?page="+((offset/5)+2);
        var sliced = entities.slice(0,5);
        res
        .status(200)
        .send({total:entities.length + offset,playlists:sliced,next:next})
        .end();
      }else{
        res
        .status(200)
        .send({total:entities.length + offset,playlists:entities})
        .end();
      }
    });
  }
});

app.get('/playlists/:playlistid', checkJwt(), (req,res) => {
  const querykey = datastore.key(['playlist',parseInt(req.params.playlistid,10)]);
  const accepts = req.accepts(['application/json']);
  datastore.get(querykey, (err,entity) => {
    if (err){
      res.status(404).send({Error:"No playlist with this playlist_id exists"}).end();
    }else if (entity == null){
      res.status(404).send({Error:"No playlist with this playlist_id exists"}).end();
    }else if (entity.owner != req.user.sub && entity.public == false){
      res.status(403).send({Error:"You do not have permission to view this playlist"}).end();
    }else{
      if(!accepts){
        res
        .status(406)
        .send({Error:"Not Acceptable"})
        .end();
      }else if(accepts == 'application/json'){
        res
        .status(200)
        .json({
          id:querykey.id,
          name:entity.name,
          description:entity.description,
          numsongs:entity.numsongs,
          songs:entity.songs,
          public:entity.public,
          owner:entity.owner,
          self:URL + "playlists/"+querykey.id})
        .end();
      }else{
        res
        .status(500)
        .send("Unknown error with content type, try again in 30 seconds")
        .end();
      }
    }
  });
});

app.get('/users/:userid/playlists', (req,res) => {
  const accepts = req.accepts(['application/json']);
  if (!accepts){
    res
    .status(406)
    .send({Error:"Not Acceptable"})
    .end();
  }else{

    const usrquery = datastore.createQuery('user')
    .filter("uid",req.params.userid)
    .limit(1);

    datastore.runQuery(usrquery).then(raws => {
      var entity = raws[0][0];
      if(entity == null){
        res.status(404).send({Error:"No user with this user_id exists"}).end();
      }else{
        var offset = 0;
        if(req.query.page != null){
          offset = 5 * (req.query.page - 1);
        }
        const query = datastore  
        .createQuery('playlist')
        .filter("owner",req.params.userid)
        .filter("public",true)
        .offset(offset);
          
        datastore.runQuery(query).then(raws => {
          var entities = raws[0];
          if(entities.length >= 6){
            const next = URL + "users/"+req.params.userid+"/playlists?page="+((offset/5)+2);
            var sliced = entities.slice(0,5);
            res
            .status(200)
            .send({total:entities.length + offset,playlists:sliced,next:next})
            .end();
          }else{
            res
            .status(200)
            .send({total:entities.length + offset,playlists:entities})
            .end();
          }
        });
      }
    });
  }
});

app.put('/playlists/:playlistid', checkJwt(), (req,res) => {
  const querykey = datastore.key(['playlist',parseInt(req.params.playlistid,10)]);
  if(req.get('content-type')!= 'application/json'){
    res
    .status(415)
    .send({Error: "Only application/json data is accepted"})
    .end();
  }
  if (Object.keys(req.body).length != 3){
    res
    .status(400)
    .send({Error : "Number of attributes is invalid" })
    .end();
  }
  if (
  typeof req.body.name != "string" || typeof req.body.description != "string" || typeof req.body.public != "boolean" ||
  req.body.name.length < 1 || req.body.description.length < 1)
  {
    res
    .status(400)
    .send({Error : "One or more of the required attributes is invalid" })
    .end();
  }else{
    datastore.get(querykey, (err,entity) => {
      if (err){
        res.status(404).send({Error:"No playlist with this playlist_id exists"}).end();
      }else if (entity == null){
        res.status(404).send({Error:"No playlist with this playlist_id exists"}).end();
      }else if (entity.owner != req.user.sub){
        res.status(403).send({Error:"You do not own this playlist"}).end();
      }else{
        const playlist = {
          name : req.body.name,
          description : req.body.description,
          numsongs : entity.numsongs,
          songs : entity.songs,
          public : req.body.public,
          owner : entity.owner
        };
        const playlistEntity = {
          key : querykey,
          data : playlist
        };
        datastore.update(playlistEntity).then(() => {
          res
          .status(200)
          .json({
            id:querykey.id,
            name:playlist.name,
            description:playlist.description,
            numsongs:playlist.numsongs,
            songs:playlist.songs,
            public:playlist.public,
            owner:playlist.owner,
            self:URL + "playlists/"+querykey.id})
          .end();
        }).catch(() => {
          res
          .status(500)
          .send({Error : "Unknown server error" })
          .end();
        }); 
      }
    });
  }
});

app.patch('/playlists/:playlistid', checkJwt(), (req,res) => {
  const querykey = datastore.key(['playlist',parseInt(req.params.playlistid,10)]);
  if(req.get('content-type')!= 'application/json'){
    res
    .status(415)
    .send({Error: "Only application/json data is accepted"})
    .end();
  }
  if (Object.keys(req.body).length > 3 || Object.keys(req.body).length < 1){
    res
    .status(400)
    .send({Error : "Number of attributes is invalid" })
    .end();
  }
  var nameTaken = false;
  var descTaken = false;
  var publicTaken = false;
  var isValid = true;
  var values = {};
  Object.keys(req.body).forEach(element => {
    if (element == "name" && !nameTaken){
      if (typeof req.body.name != "string"  || req.body.name.length < 1){
        isValid = false;
      }else{
        values["name"] = req.body.name;
        nameTaken = true; 
      }
    }else if(element == "description" && !descTaken){
      if (typeof req.body.description != "string" || req.body.description.length < 1){
        isValid = false;
      }else{
        values["description"] = req.body.description;
        descTaken = true;
      }
    }else if(element == "public" && !publicTaken){
      if (typeof req.body.public != "boolean"){
        isValid = false;
      }else{
        values["public"] = req.body.public;
        publicTaken = true;
      }
    }else{
      isValid = false;
    }
  });
  if(isValid){
    datastore.get(querykey, (err,entity) => {
      if (err){
        res.status(404).send({Error:"No playlist with this playlist_id exists"}).end();
      }else if (entity == null){
        res.status(404).send({Error:"No playlist with this playlist_id exists"}).end();
      }else if (entity.owner != req.user.sub){
        res.status(403).send({Error:"You do not own this playlist"}).end();
      }else{
        var playlist = {
          name : entity.name,
          description : entity.description,
          numsongs : entity.numsongs,
          songs : entity.songs,
          public : entity.public,
          owner : entity.owner
        };

        Object.keys(values).forEach(element => {
          playlist[element] = values[element];
        });

        const playlistEntity = {
          key : querykey,
          data : playlist
        };
        datastore.update(playlistEntity).then(() => {
          res
          .status(200)
          .json({
            id:querykey.id,
            name:playlist.name,
            description:playlist.description,
            numsongs:playlist.numsongs,
            songs:playlist.songs,
            public:playlist.public,
            owner:playlist.owner,
            self:URL + "playlists/"+querykey.id})
          .end();
        }).catch(() => {
          res
          .status(500)
          .send({Error : "Unknown server error" })
          .end();
        });
      }
    });
  }else{
    res
    .status(400)
    .send({Error : "One or more of the required attributes is invalid" })
    .end();
  }
});

app.delete('/playlists/:playlistid', checkJwt(), (req,res) => {
  const querykey = datastore.key(['playlist',parseInt(req.params.playlistid,10)]);
  datastore.get(querykey, (err,entity) => {
    if (err){
      res.status(404).send({Error:"No playlist with this playlist_id exists"}).end();
    }else if (entity == null){
      res.status(404).send({Error:"No playlist with this playlist_id exists"}).end();
    }else if(entity.owner != req.user.sub){
      res.status(403).send({Error:"You do not own this playlist"}).end();
    }else{
      datastore.delete(querykey).then(() => {
        res.sendStatus(204);
      });
    }
  });
});

// -------------------- SONGS AND PLAYLISTS -------------------

app.put('/playlists/:playlistid/songs/:songid',checkJwt(),(req,res) => {
  const querykeyplaylist = datastore.key(['playlist',parseInt(req.params.playlistid,10)]);
  const querykeysong = datastore.key(['song',parseInt(req.params.songid,10)]);

  var getPlayListRes = datastore.get(querykeyplaylist);
  var getSongRes = datastore.get(querykeysong);

  Promise.all([getPlayListRes,getSongRes]).then(raws => {
    var results = [raws[0][0],raws[1][0]];
    if(results[0] == null || results[1] == null){
      res.status(404).send({Error:"The specified playlist and/or song does not exist"}).end();
    }
    else if(results[0].owner != req.user.sub){
      res.status(403).send({Error:"You do not own this playlist"}).end();
    }
    else{
      var valid = true;
      results[0].songs.forEach(song => {
        if(song.id == querykeysong.id){
          res.status(403).send({Error:"The song is already in this playlist"}).end();
          valid = false;
        }
      });
      if(valid){
        var new_songs = results[0].songs;
        new_songs.push({id:querykeysong.id,self:URL + "songs/"+querykeysong.id});
    
        const newPlaylist = {
          name : results[0].name,
          description : results[0].description,
          numsongs : results[0].numsongs + 1,
          songs : new_songs,
          public : results[0].public,
          owner : results[0].owner
        };
  
        const playlistEntity = {
          key : querykeyplaylist,
          data : newPlaylist
        };
    
        datastore.update(playlistEntity).then(() => {
          res.status(204).end();
        });
      }
    }

  }).catch(err => {
    res.status(404).send({Error:"The specified playlist and/or song does not exist"}).end();
  });
});

app.delete('/playlists/:playlistid/songs/:songid',checkJwt(),(req,res) => {
  const querykeyplaylist = datastore.key(['playlist',parseInt(req.params.playlistid,10)]);
  const querykeysong = datastore.key(['song',parseInt(req.params.songid,10)]);

  var getPlayListRes = datastore.get(querykeyplaylist);
  var getSongRes = datastore.get(querykeysong);

  Promise.all([getPlayListRes,getSongRes]).then(raws => {
    var results = [raws[0][0],raws[1][0]];
    if(results[0] == null || results[1] == null){
      res.status(404).send({Error:"The specified playlist and/or song does not exist"}).end();
    }else if(results[0].owner != req.user.sub){
      res.status(403).send({Error:"You do not own this playlist"}).end();
    }
    else{
      var valid = false;
      results[0].songs.forEach(song => {
        if(song.id == querykeysong.id){
          valid = true;
        }
      });
      if(valid){
        var new_songs = [];
        results[0].songs.forEach(song => {
          if (song.id != querykeysong.id){
            new_songs.push(song);
          }
        });
    
        const newPlaylist = {
          name : results[0].name,
          description : results[0].description,
          numsongs : results[0].numsongs - 1,
          songs : new_songs,
          public : results[0].public,
          owner : results[0].owner
        };
  
        const playlistEntity = {
          key : querykeyplaylist,
          data : newPlaylist
        };
    
        datastore.update(playlistEntity).then(() => {
          res.status(204).end();
        });
      }else{
        res.status(403).send({Error:"The song is not in this playlist"}).end();
      }
    }

  }).catch(err => {
    res.status(404).send({Error:"The specified playlist and/or song does not exist"}).end();
  });
});

// ------------------ 405 ROUTERS -------------------------

app.post('/users', (req,res) => {
  res
  .set('Accept','GET')
  .status(405)
  .end();
});

app.put('/users/:userid', (req,res) => {
  res
  .set('Accept','GET')
  .status(405)
  .end();
});

app.patch('/users/:userid', (req,res) => {
  res
  .set('Accept','GET')
  .status(405)
  .end();
});

app.delete('/users/:userid', (req,res) => {
  res
  .set('Accept','GET')
  .status(405)
  .end();
});


// ------------------ AUTH0 ROUTERS -------------------------

app.post('/login', (req,res) => {
  const username = req.body.email;
  const password = req.body.password;
  var options = { method: 'POST',
          url: `https://${DOMAIN}/oauth/token`,
          headers: { 'content-type': 'application/json' },
          body:
           { grant_type: 'password',
             username: username,
             password: password,
             client_id: CLIENT_ID,
             client_secret: CLIENT_SECRET },
          json: true };
  request(options, (error, response, body) => {
      if (error){
        res.status(500).send(error);
      } else {
        res.status(200).send(body);
      }
  });
});

app.post('/signup', (req,res) => {
  const email = req.body.email;
  const password = req.body.password;
  var options = { 
    method: 'POST',
    url: `https://${DOMAIN}/dbconnections/signup`,
    headers: { 'content-type': 'application/json' },
    body:
      { 
        connection: 'Username-Password-Authentication',
        email: email,
        password: password,
        client_id: CLIENT_ID 
      },
    json: true 
  };

  request(options, (error, response, body) => {
    if (error){
        res.status(500).send(error);
    } else {
      let ts = Date.now();

      let date_ob = new Date(ts);
      let date = date_ob.getDate();
      let month = date_ob.getMonth() + 1;
      let year = date_ob.getFullYear();

      const userKey = datastore.key("user");

      const user = {
        email : email,
        username : email,
        joindate : year + "-" + month + "-" + date,
        uid : "auth0|"+body._id
      }

      const userEntity = {
        key : userKey,
        data : user
      }

      datastore.upsert(userEntity).then(() => {
        res.status(201).send(body);
      })
    }
  });
});

app.get('/', (req,res) => {
  res.status(200).send("SnP REST API");
});

// Listen to the App Engine-specified port, or 8080 otherwise
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}...`);
});

