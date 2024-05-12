/*
 * Introduces a typal object to make classical/prototypal patterns easier
 * Plus some AOP sugar
 *
 * By Zachary Carter <zach@carter.name>
 * MIT Licensed
 * */

const typal = (function () {
  const create = Object.create || function (o) { function F () {}; F.prototype = o; return new F() }
  const position = /^(before|after)/

  // basic method layering
  // always returns original method's return value
  function layerMethod (k, fun) {
    const pos = k.match(position)[0]
    const key = k.replace(position, '')
    const prop = this[key]

    if (pos === 'after') {
      this[key] = function () {
        const ret = prop.apply(this, arguments)
        const args = [].slice.call(arguments)
        args.splice(0, 0, ret)
        fun.apply(this, args)
        return ret
      }
    } else if (pos === 'before') {
      this[key] = function () {
        fun.apply(this, arguments)
        const ret = prop.apply(this, arguments)
        return ret
      }
    }
  }

  // mixes each argument's own properties into calling object,
  // overwriting them or layering them. i.e. an object method 'meth' is
  // layered by mixin methods 'beforemeth' or 'aftermeth'
  function typal_mix () {
    const self = this
    for (var i = 0, o, k; i < arguments.length; i++) {
      o = arguments[i]
      if (!o) continue
      if (Object.prototype.hasOwnProperty.call(o, 'constructor')) { this.constructor = o.constructor }
      if (Object.prototype.hasOwnProperty.call(o, 'toString')) { this.toString = o.toString }
      for (k in o) {
        if (Object.prototype.hasOwnProperty.call(o, k)) {
          if (k.match(position) && typeof this[k.replace(position, '')] === 'function') { layerMethod.call(this, k, o[k]) } else { this[k] = o[k] }
        }
      }
    }
    return this
  }

  return {
    // extend object with own typalperties of each argument
    mix: typal_mix,

    // sugar for object begetting and mixing
    // - Object.create(typal).mix(etc, etc);
    // + typal.beget(etc, etc);
    beget: function typal_beget () {
      return arguments.length ? typal_mix.apply(create(this), arguments) : create(this)
    },

    // Creates a new Class function based on an object with a constructor method
    construct: function typal_construct () {
      const o = typal_mix.apply(create(this), arguments)
      const constructor = o.constructor
      const Klass = o.constructor = function () { return constructor.apply(this, arguments) }
      Klass.prototype = o
      Klass.mix = typal_mix // allow for easy singleton property extension
      return Klass
    },

    // no op
    constructor: function typal_constructor () { return this }
  }
})()

if (typeof exports !== 'undefined') { exports.typal = typal }
