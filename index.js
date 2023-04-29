var Service;
var Characteristic;

var mqtt = require("mqtt");

module.exports = function(homebridge) {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  homebridge.registerAccessory('homebridge-CommandePortail-Mqtt', 'CommandePortail-Mqtt', PortailAccessoryMqtt);
};

function PortailAccessoryMqtt(log, config) {
  this.log = log;
  this.name = config.name;

  this.client_Id = 'mqttCommande' + config.module;
  this.options = {
    keepalive: 10,
    clientId: this.client_Id,
    protocolId: 'MQTT',
    protocolVersion: 4,
    clean: true,
    reconnectPeriod: 1000,
    connectTimeout: 30 * 1000,
    will: {
      topic: 'WillMsg',
      payload: 'Connection Closed abnormally..!',
      qos: 0,
      retain: false
    },
    rejectUnauthorized: false
  };

  this.client = mqtt.connect("mqtt://localhost", this.options);

  this.client.on('error', this.mqttGererErreur.bind(this));
  this.client.on('connect', this.mqttGererConnexion.bind(this));
  this.client.on('message', this.mqttGererMessage.bind(this));

  this.MqttTopicLedPorteOuverte    = "Tele/" + config.module + "/LedPorteOuverte";
  this.MqttTopicLedPorteFermee     = "Tele/" + config.module + "/LedPorteFermee";
  this.MqttTopicLedSecurite        = "Tele/" + config.module + "/LedSecurite";
  this.MqttTopicCommandeActionneur = "Commande/" + config.module + "/OuvertureDemandee";
    
  this.client.subscribe(this.MqttTopicLedPorteOuverte);
  this.client.subscribe(this.MqttTopicLedPorteFermee);
  this.client.subscribe(this.MqttTopicLedSecurite);
  
  this.delaiDeReaction = 1000 * (config.delaiDeReaction || 2);
  this.delaiDeMouvement = 1000 * (config.delaiDeMouvement || 20);
  this.delaiInterCommandes = 1000 * (config.delaiInterCommandes || 2);
  this.intervalLecture = (config.intervalLecture || 1);
  this.dureeActionneur = config.dureeActionneur || 500;
  this.debug = config.debug || 0;
  this.etatPorteActuel = Characteristic.CurrentDoorState.CLOSED; //Etat initial
  this.etatPorteDemande = Characteristic.TargetDoorState.CLOSED; //Etat initial
  this.etatPorteObstruction = false; //Etat initial
  this.etatCapteurFerme = false;
  this.etatCapteurOuvert = false;
  this.etatCapteurSecurite = false;
  this.horodatageMouvement = 0;
  this.horodatageCommande = 0;
  this.commandeEnAttente = 0;
  this.log('Fin PorteDeGarageAccessory');
}

PortailAccessoryMqtt.prototype.setStateDemande = function(estFerme, callback, context) {
  if (context === 'pollState') {
    // The state has been updated by the pollState command - don't run the open/close command
    callback(null);
    return;
  }

  var accessory = this;
  var etatDemande = estFerme ? 'close' : 'open';

  accessory.log('Appel de setStateDemande : etat = ' + etatDemande + ', context = ' + context);

  if(etatDemande == 'open') {
    accessory.etatPorteDemande = Characteristic.TargetDoorState.OPEN;
  }
  if(etatDemande == 'close') {
    accessory.etatPorteDemande = Characteristic.TargetDoorState.CLOSED;
  }

  callback();
  return true;
};

PortailAccessoryMqtt.prototype.getStateActuel = function(callback) {
  var accessory = this;

  accessory.log('Appel de getStateActuel : etat = ' + accessory.etatPorteActuel);

  callback(null, accessory.etatPorteActuel);
}

PortailAccessoryMqtt.prototype.getStateDemande = function(callback) {
  var accessory = this;

  accessory.log('Appel de getStateDemande : etat = ' + accessory.etatPorteDemande);

  callback(null, accessory.etatPorteDemande);
}

PortailAccessoryMqtt.prototype.getStateObstruction = function(callback) {
  var accessory = this;

  accessory.log('Appel de getStateObstruction : etat = ' + accessory.etatPorteObstruction);

  callback(null, accessory.etatPorteObstruction);
}

PortailAccessoryMqtt.prototype.mqttGererErreur = function() {
  var accessory = this;

  accessory.log("Erreur Mqtt");
}

PortailAccessoryMqtt.prototype.mqttGererConnexion = function(topic, message) {
  var accessory = this;

//  accessory.client.publish("cmnd/" + this.module + "/TelePeriod","10"); //# active la remontée d'infos toutes les 10s
  accessory.log("Confirmation de la connexion au broker MQTT");
}

PortailAccessoryMqtt.prototype.mqttGererMessage = function(topic, message) {
  var accessory = this;
  var status;

  if(accessory.debug) {
    accessory.log("Message brut = " + message.toString());
  }

  // LED  ALLUMÉE                   ÉTEINTE  
  // OPEN commande activée          commande désactivée
  // STOP commande désactivée       commande activée
  // FSW  sécuritésau repos         sécurités au travail
  // FCC  fin de course fer. dégagé fin de course fer. engagé
  // FCA  fin de course ouv. dégagé fin de course ouv. engagé

  status = message.toString();
  accessory.log("Message reçu de " + accessory.name + " : " + topic + " = " + status);

  switch(topic) {
    case accessory.MqttTopicLedPorteOuverte :
      switch(status) {
        case 'Allumée' :
          accessory.etatCapteurOuvert = false;
          if(accessory.debug) {
            accessory.log('Réception Mqtt, état du capteurOuvert de ' + accessory.name + ' est : faux');
          }
          break;
        case 'Eteinte' :
          accessory.etatCapteurOuvert = true;
          if(accessory.debug) {
            accessory.log('Réception Mqtt, état du capteurOuvert de ' + accessory.name + ' est : vrai');
          }
        break;
      }    
    break;
    case accessory.MqttTopicLedPorteFermee :
      switch(status) {
        case 'Allumée' :
          accessory.etatCapteurFerme = false;
          if(accessory.debug) {
            accessory.log('Réception Mqtt, état du capteurFerme de ' + accessory.name + ' est : faux');
          }
        break;
        case 'Eteinte' :
          accessory.etatCapteurFerme = true;
          if(accessory.debug) {
            accessory.log('Réception Mqtt, état du capteurFerme de ' + accessory.name + ' est : vrai');
          }
        break;
      }    
    break;
    case accessory.MqttTopicLedSecurite :
      switch(status) {
        case 'Allumée' :
          accessory.etatCapteurSecurite = false;
          if(accessory.debug) {
            accessory.log('Réception Mqtt, état du capteurSecurite de ' + accessory.name + ' est : faux');
          }
        break;
        case 'Eteinte' :
          accessory.etatCapteurSecurite = true;
          if(accessory.debug) {
            accessory.log('Réception Mqtt, état du capteurSecurite de ' + accessory.name + ' est : vrai');
          }
        break;
      }    
    break;
  }
}

PortailAccessoryMqtt.prototype.gererEtat = function() {
  var accessory = this;
  var horodatageGestionEtat = Date.now();
  var changeEtatActuel = false;
  var changeEtatDemande = false;
  var changeEtatObstruction = false;

  if(accessory.debug) {
    accessory.log('Etat demande      : ' + accessory.etatPorteDemande);
    accessory.log('Etat actuel       : ' + accessory.etatPorteActuel);
    accessory.log('Etat obstruction  : ' + accessory.etatPorteObstruction);
  }

  if(accessory.debug) {
    accessory.log('Etat du capteurOuvert de ' + accessory.name + ' est : ' + '(' + accessory.etatCapteurOuvert + ')');
    accessory.log('Etat du capteurFerme de ' + accessory.name + ' est : ' + '(' + accessory.etatCapteurFerme + ')');
  }

  // en fonction des etats des capteurs et de l'etat actuel, detection d'un mouvement de la porte
  if(!accessory.etatCapteurOuvert && !accessory.etatCapteurFerme) {
    if(accessory.etatPorteActuel == Characteristic.CurrentDoorState.OPEN) {
      // si les capteurs ouvert et ferme ne sont pas a vrai (donc la porte est entre les deux)
      // et que l'etat actuel de la porte est ouvert alors :
      // - l'etat actuel de la porte devient en fermeture
      // - l'etat demande de la porte est ferme
      accessory.etatPorteActuel = Characteristic.CurrentDoorState.CLOSING;
      changeEtatActuel = true;
      accessory.log('Etat de ' + accessory.name + ' est : Fermeture');
      accessory.horodatageMouvement = Date.now();
      
      if(accessory.etatPorteDemande != Characteristic.TargetDoorState.CLOSED) {
        accessory.log('Demande de fermeture  de ' + accessory.name + ' par l\'interrupteur ou une télécommande');
        accessory.etatPorteDemande = Characteristic.TargetDoorState.CLOSED;
        changeEtatDemande = true;
      }
      if(accessory.horodatageCommande == 0) {
        // si il n'y a pas d'horodatage de la commande (donc action par telecommande  ou l'interrupteur) 
        accessory.horodatageCommande = accessory.horodatageMouvement;
      } else {
        // sinon la commande a ete activee par home => affichage du delai de reaction entre l'impulsion et 
        // le changement d'etat des capteurs
        accessory.log('Temps de réaction = ' + (horodatageGestionEtat - accessory.horodatageCommande)/1000 + ' s');
      }
      if(accessory.etatPorteObstruction) {
        // le capteur ouvert vient de passer a OFF alors que la porte etait precedement en position ouvert
        // donc la porte n'est plus dans l'etat d'obstruction
        accessory.log('Fin de l\'état d\'obstruction pour ' + accessory.name);
        accessory.etatPorteObstruction = false;
        changeEtatObstruction = true;
      }
    }
    if(accessory.etatPorteActuel == Characteristic.CurrentDoorState.CLOSED) {
      // si les capteurs ouvert et ferme ne sont pas a vrai (donc la porte est entre les deux)
      // et que l'etat actuel de la porte est ferme alors :
      // - l'etat actuel de la porte devient en ouverture
      // - l'etat demande de la porte est ouvert
      accessory.etatPorteActuel = Characteristic.CurrentDoorState.OPENING;
      changeEtatActuel = true;
      accessory.log('Etat de ' + accessory.name + ' est : Ouverture');
      accessory.horodatageMouvement = Date.now();
      
      if(accessory.etatPorteDemande != Characteristic.TargetDoorState.OPEN) {
        accessory.log('Demande d\'ouverture  de ' + accessory.name + ' par l\'interrupteur ou une télécommande');
        accessory.etatPorteDemande = Characteristic.TargetDoorState.OPEN;
        changeEtatDemande = true;
      }
      if(accessory.horodatageCommande == 0) {
        // si il n'y a pas d'horodatage de la commande (donc action par telecommande  ou l'interrupteur) 
        accessory.horodatageCommande = accessory.horodatageMouvement;
      } else {
        // sinon la commande a ete activee par home => affichage du delai de reaction entre l'impulsion et 
        // le changement d'etat des capteurs
        accessory.log('Temps de réaction = ' + (horodatageGestionEtat - accessory.horodatageCommande)/1000 + ' s');
      }
      if(accessory.etatPorteObstruction) {
        // le capteur ferme vient de passer a OFF alors que la porte etait precedement en position ferme
        // donc la porte n'est plus dans l'etat d'obstruction
        accessory.log('Fin de l\'état d\'obstruction pour ' + accessory.name);
        accessory.etatPorteObstruction = false;
        changeEtatObstruction = true;
      }
    }
  }

  if(accessory.etatCapteurFerme) {
    if(accessory.etatPorteActuel != Characteristic.CurrentDoorState.CLOSED) {
      // si le capteur ferme est a vrai (donc la porte est fermee)
      // et que l'etat actuel de la porte n'est pas ferme alors :
      // - l'etat actuel de la porte devient ferme
      // - l'etat demande de la porte est ferme
      accessory.etatPorteActuel = Characteristic.CurrentDoorState.CLOSED;
      accessory.etatPorteDemande = Characteristic.TargetDoorState.CLOSED;
      changeEtatDemande = true;
      changeEtatActuel = true;
      accessory.log('Etat de ' + accessory.name + ' est : Ferme');
      accessory.log('Temps de fermeture = ' + (horodatageGestionEtat - accessory.horodatageMouvement)/1000 + ' s');
      accessory.horodatageMouvement = 0;
      accessory.horodatageCommande = 0;
      
      if(accessory.etatPorteObstruction) {
        // le capteur ferme vient de passer a ON alors que la porte n'etait pas precedement en position ferme
        // donc la porte n'est plus dans l'etat d'obstruction
        accessory.log('Fin de l\'état d\'obstruction pour ' + accessory.name);
        accessory.etatPorteObstruction = false;
        changeEtatObstruction = true;
      }
    }
  }

  if(accessory.etatCapteurOuvert) {
    if(accessory.etatPorteActuel != Characteristic.CurrentDoorState.OPEN) {
      // si le capteur ouvert est a vrai (donc la porte est ouverte)
      // et que l'etat actuel de la porte n'est pas ouvert alors :
      // - l'etat actuel de la porte devient ouvert
      // - l'etat demande de la porte est ouvert
      accessory.etatPorteActuel = Characteristic.CurrentDoorState.OPEN;
      accessory.etatPorteDemande = Characteristic.CurrentDoorState.OPEN;
      changeEtatDemande = true;
      changeEtatActuel = true;
      accessory.log('Etat de ' + accessory.name + ' est : ouvert');
      accessory.log('Temps d\'ouverture = ' + (horodatageGestionEtat - accessory.horodatageMouvement)/1000 + ' s');
      accessory.horodatageMouvement = 0;
      accessory.horodatageCommande = 0;
      
      if(accessory.etatPorteObstruction) {
        // le capteur ouvert vient de passer a ON alors que la porte n'etait pas precedement en position ouverte 
        // donc la porte n'est plus dans l'etat d'obstruction
        accessory.log('Fin de l\'état d\'obstruction pour ' + accessory.name);
        accessory.etatPorteObstruction = false;
        changeEtatObstruction = true;
      }
    }
  }

  // Pour la porte la commande est rudimentaire : une impulsion =>
  // Cas 1 : si la porte est fermee => la porte s'ouvre
  // Cas 2 : si la porte est ouverte => rien
  // Cas 3 : si la porte est en train de se fermer => la porte se rouvre
  // Cas 4 : si la porte est en train de s'ouvrir => rien

  // en fonction de l'etat demande on detecte une demande d'ouverture/fermeture provenant de home
  switch(accessory.etatPorteDemande) {
    case Characteristic.TargetDoorState.OPEN :
      switch(accessory.etatPorteActuel) {
        case Characteristic.CurrentDoorState.CLOSED :
          // si l'etat demande est ouvert et que la porte est fermee
          // => Cas 1 : on active la commande
          // Il est inutile de changer l'etat actuel.
          
          if(accessory.horodatageCommande == 0) {
            // Si aucune commande n'a ete envoyee => Cas 1 : on active la commande
            accessory.log('Etat demandé et actuel de ' + accessory.name + ' sont : (ouvert, fermé) => une implusion');
            accessory.commandeEnAttente++;
          } else if ((horodatageGestionEtat - accessory.horodatageCommande) < accessory.delaiDeReaction) {
            // Si une commande a deja ete envoyee depuis moins de 2 secondes, on attend
            accessory.log('Etat demandé et actuel de ' + accessory.name + ' sont : (ouvert, fermé), en attente de mouvement');
          } else {
            // Si une commande a deja ete envoyee depuis plus de 2 secondes, et que rien ne bouge, il y a un pb
            //   => on change l'etat demande a CLOSED (on annule la demande) et on passe en etat d'obstruction
            accessory.log('Etat demandé et actuel de ' + accessory.name + ' sont : (ouvert, fermé), pas de mouvement, on annule la demande');
            changeEtatDemande = true;
            accessory.etatPorteObstruction = true;
            changeEtatObstruction = true;
            accessory.horodatageCommande = 0;
          }
        break;
        case Characteristic.CurrentDoorState.CLOSING : 
          // si l'etat demande est ouvert et que la porte est en train de se fermer
          // => Cas 3 : on active la commande
          // Il faut changer l'etat actuel de la porte de fermeture a ouverture
          accessory.log('Etat demandé et actuel de ' + accessory.name + ' sont : (ouvrir, en fermeture) => une impulsion');
          accessory.log('Etat demandé et actuel de ' + accessory.name + ' deviennent : (ouvrir, en ouverture');
          accessory.etatPorteActuel = Characteristic.CurrentDoorState.OPENING;
          changeEtatActuel = true;
          accessory.commandeEnAttente++;
        break;
        case Characteristic.CurrentDoorState.OPENING :
          // si la demande est ouverte et que la porte est en train de s'ouvrir
          // on ne fait rien sauf si le delai est trop important
          if ((horodatageGestionEtat - accessory.horodatageMouvement) < accessory.delaiDeMouvement) {
            if(accessory.debug) {
              accessory.log('Etat demandé et actuel de ' + accessory.name + ' sont : (ouvrir, en ouverture) => rien');
            }
          } else {
            if(!accessory.etatPorteObstruction) {
              // la porte passe dans l'etat d'obstruction si elle ne l'est pas deja
              accessory.log('Etat demandé et actuel de ' + accessory.name + ' sont : (ouvrir, en ouverture) et delai depasse => obstruction');
              accessory.etatPorteObstruction = true;
              changeEtatObstruction = true;
              accessory.horodatageCommande = 0;
            }
          }
        break;
        case Characteristic.CurrentDoorState.OPEN :
          // si l'etat demande est ouvert et que la porte est ouverte
          // on ne fait rien
          accessory.log('Etat demandé et actuel de ' + accessory.name + ' sont : (ouvrir, ouvert) => rien');
        break;
        case Characteristic.CurrentDoorState.STOPPED :
          // si la demande est ouvert et que la porte est stoppee
          // Pas d'état stoppé
        break;
      }
    break;
    case Characteristic.TargetDoorState.CLOSED : 
      switch(accessory.etatPorteActuel) {
        case Characteristic.CurrentDoorState.OPEN : 
          // si la demande est ferme et que la porte est ouverte
          // Annule la demande.
          // la demande passe a ouvert
          accessory.log('Etat demandé et actuel de ' + accessory.name + ' sont : (ferme, ouvert)');
          accessory.log('Etat demandé et actuel de ' + accessory.name + ' deviennent : (ouvert, ouvert');
          Characteristic.TargetDoorState.OPEN;
          changeEtatDemande = true;
        break;
        case Characteristic.CurrentDoorState.OPENING : 
          // si la demande est ferme et que la porte est en train de s'ouvrir
          // Annule la demande.
          // la demande passe a ouvert
          accessory.log('Etat demandé et actuel de ' + accessory.name + ' sont : (ferme, en ouverture)');
          accessory.log('Etat demandé et actuel de ' + accessory.name + ' deviennent : (ouvert, ouverture');
          Characteristic.TargetDoorState.OPEN;
          changeEtatDemande = true;
        break;
        case Characteristic.CurrentDoorState.CLOSING : 
          // si la demande est ferme et que la porte est en train de s'ouvrir
          // on ne fait rien
          accessory.log('Etat demandé et actuel de ' + accessory.name + ' sont : (fermer, en fermeture) => rien');
        break;
        case Characteristic.CurrentDoorState.CLOSED : 
          // si la demande est ferme et que la porte est fermee
          // on ne fait rien
          accessory.log('Etat demandé et actuel de ' + accessory.name + ' sont : (fermé, fermé) => rien');
        break;
        case Characteristic.CurrentDoorState.STOPPED : 
          // si la demande est ferme et que la porte est stoppee
          // Pas d'état stoppé
          break;
      }
    break;
  }

  // mise a jour des etats dans home en fonction de ce qui vient d'etre calcule
  if(changeEtatDemande) {
    accessory.garageDoorService.getCharacteristic(Characteristic.TargetDoorState).updateValue(accessory.etatPorteDemande);
  }
  if(changeEtatActuel) {
    accessory.garageDoorService.getCharacteristic(Characteristic.CurrentDoorState).updateValue(accessory.etatPorteActuel);
  }
  if(changeEtatObstruction) {
    accessory.garageDoorService.getCharacteristic(Characteristic.ObstructionDetected).updateValue(accessory.etatPorteObstruction);
  }

  // Chaque nouvelle demande de commande incremente le compteur commandeEnAttente afin de gérer les demandes de commande quasi simulatanées 
  // le delai de 1,5s est vérifie avant chaque nouvel envoi de commande.
  if(accessory.commandeEnAttente != 0) {
    if((accessory.horodatageCommande == 0) || ((horodatageGestionEtat - accessory.horodatageCommande) > accessory.delaiInterCommandes) ) {
      accessory.commandeEnAttente--;
      accessory.log('Commande envoyée : ' + accessory.MqttTopicCommandeActionneur + " = " + accessory.dureeActionneur);
      accessory.client.publish(accessory.MqttTopicCommandeActionneur, " " + accessory.dureeActionneur, { qos: 0 }); 
    } else {
      accessory.log('La précédente commande a été envoyée il y a ' + (horodatageGestionEtat - accessory.horodatageCommande)/1000  + ' s, pas de commande réenvoyée immédiatement');
    }
    accessory.log('Il reste ' + accessory.commandeEnAttente + ' commande(s) en attente');
  }

  if(accessory.debug) {
    accessory.log('Relance de interrogerEtat dans ' + accessory.intervalLecture + 's');
  }
  // Clear any existing timer
  if (accessory.stateTimer) {
    clearTimeout(accessory.stateTimer)
    accessory.stateTimer = null;
  }
  accessory.stateTimer = setTimeout(this.gererEtat.bind(this), accessory.intervalLecture * 1000);
};

PortailAccessoryMqtt.prototype.getServices = function() {
  this.log('Debut Getservices');
  this.informationService = new Service.AccessoryInformation();
  this.garageDoorService = new Service.GarageDoorOpener(this.name);

  this.informationService
  .setCharacteristic(Characteristic.Manufacturer, 'Fabrique du Capitaine Kirk')
  .setCharacteristic(Characteristic.Model, 'Portail Mqtt')
  .setCharacteristic(Characteristic.SerialNumber, '1.0.0');

  this.garageDoorService.getCharacteristic(Characteristic.TargetDoorState)
  .on('set', this.setStateDemande.bind(this))
  .on('get', this.getStateDemande.bind(this))
  .updateValue(this.etatPorteDemande);

  this.garageDoorService.getCharacteristic(Characteristic.CurrentDoorState)
  .on('get', this.getStateActuel.bind(this))
  .updateValue(this.etatPorteActuel);

  this.garageDoorService.getCharacteristic(Characteristic.ObstructionDetected)
  .on('get', this.getStateObstruction.bind(this))
  .updateValue(this.etatPorteObstruction);

  this.stateTimer = setTimeout(this.gererEtat.bind(this),this.intervalLecture * 1000);

  return [this.informationService, this.garageDoorService];
};

