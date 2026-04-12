package store

import "errors"

var ErrNotFound = errors.New("not found")
var ErrNoKnipjes = errors.New("geen knipjes meer")
var ErrForbidden = errors.New("verboden")
var ErrAlreadyPending = errors.New("er is al een openstaande aanvraag")
var ErrCannotCancelTrustUsed = errors.New("annuleren niet mogelijk: er zijn al knipjes gebruikt op deze kaart")
var ErrCannotRejectKnipjesUsed = errors.New("weigeren niet mogelijk: er zijn al knipjes gebruikt; accordeer de betaling")
var ErrInvalidCredentials = errors.New("ongeldige gebruikersnaam of wachtwoord")
var ErrUsernameTaken = errors.New("gebruikersnaam bestaat al")
var ErrCardNotForTosti = errors.New("deze kaart is geen tostikaart")
var ErrCardPhysicalReadonly = errors.New("fysieke kaart is alleen read-only in de app")
var ErrInvalidCurrentPassword = errors.New("huidig wachtwoord is onjuist")
var ErrNotLocalAccount = errors.New("account gebruikt geen lokaal wachtwoord")
