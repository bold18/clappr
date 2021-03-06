// Copyright 2014 Globo.com Player authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

/**
 * The Core is responsible to manage Containers, the mediator, MediaControl
 * and the player state.
 */

var _ = require('underscore')
var $ = require('zepto')

var UIObject = require('ui_object')
var ContainerFactory = require('../container_factory')
var Fullscreen = require('../../base/utils').Fullscreen
var Styler = require('../../base/styler')
var MediaControl = require('media_control')
var PlayerInfo = require('player_info')
var Mediator = require('mediator')
var Events = require('events');

class Core extends UIObject {
  get events() {
    return {
      'webkitfullscreenchange': 'exit',
      'mousemove': 'showMediaControl',
      'mouseleave': 'hideMediaControl'
    }
  }

  get attributes() {
    return {
      'data-player': ''
    }
  }

  constructor(options) {
    super(options)
    PlayerInfo.options = options
    this.options = options
    this.plugins = []
    this.containers = []
    this.createContainers(options)
    //FIXME fullscreen api sucks
    $(document).bind('fullscreenchange', () => this.exit())
    $(document).bind('MSFullscreenChange', () => this.exit())
    $(document).bind('mozfullscreenchange', () => this.exit())
  }

  createContainers(options) {
    this.defer = $.Deferred()
    this.defer.promise(this)
    this.containerFactory = new ContainerFactory(options, options.loader)
    this.containerFactory
      .createContainers()
      .then((containers) => this.setupContainers(containers))
      .then((containers) => this.resolveOnContainersReady(containers))
  }

  updateSize() {
    if (Fullscreen.isFullscreen()) {
      this.setFullscreen()
    } else {
      this.setPlayerSize()
    }
    Mediator.trigger(Events.PLAYER_RESIZE)
  }

  setFullscreen() {
    this.$el.addClass('fullscreen')
    this.$el.removeAttr('style')
    PlayerInfo.previousSize = PlayerInfo.currentSize
    PlayerInfo.currentSize = { width: $(window).width(), height: $(window).height() }
  }

  setPlayerSize() {
    this.$el.removeClass('fullscreen')
    PlayerInfo.currentSize = PlayerInfo.previousSize
    PlayerInfo.previousSize = { width: $(window).width(), height: $(window).height() }
    this.resize(PlayerInfo.currentSize)
  }

  resize(options) {
    var size = _.pick(options, 'width', 'height')
    this.el.style.height = `${size.height}px`;
    this.el.style.width = `${size.width}px`;
    PlayerInfo.previousSize = PlayerInfo.currentSize
    PlayerInfo.currentSize = size
    Mediator.trigger(Events.PLAYER_RESIZE)
  }

  resolveOnContainersReady(containers) {
    $.when.apply($, containers).done(() =>this.defer.resolve(this))
  }

  addPlugin(plugin) {
    this.plugins.push(plugin)
  }

  hasPlugin(name) {
    return !!this.getPlugin(name)
  }

  getPlugin(name) {
    return _(this.plugins).find((plugin) => plugin.name === name)
  }

  load(sources) {
    sources = _.isArray(sources) ? sources : [sources.toString()];
    _(this.containers).each((container) => container.destroy())
    this.containerFactory.options = _(this.options).extend({sources})
    this.containerFactory.createContainers().then((containers) => {
      this.setupContainers(containers)
    })
  }

  destroy() {
    _(this.containers).each((container) => container.destroy())
    _(this.plugins).each((plugin) => plugin.destroy())
    this.$el.remove()
    this.mediaControl.destroy()
    $(document).unbind('fullscreenchange')
    $(document).unbind('MSFullscreenChange')
    $(document).unbind('mozfullscreenchange')
}

  exit() {
    this.updateSize()
    this.mediaControl.show()
  }

  setMediaControlContainer(container) {
    this.mediaControl.setContainer(container)
    this.mediaControl.render()
  }

  disableMediaControl() {
    this.mediaControl.disable()
    this.$el.removeClass('nocursor')
  }

  enableMediaControl() {
    this.mediaControl.enable()
  }

  removeContainer(container) {
    this.stopListening(container)
    this.containers = _.without(this.containers, container)
  }

  appendContainer(container) {
    this.listenTo(container, Events.CONTAINER_DESTROYED, this.removeContainer)
    this.el.appendChild(container.render().el)
    this.containers.push(container)
  }

  setupContainers(containers) {
    _.map(containers, this.appendContainer, this)
    this.setupMediaControl(this.getCurrentContainer())
    this.render()
    this.$el.appendTo(this.options.parentElement)
    return containers
  }

  createContainer(source) {
    var container = this.containerFactory.createContainer(source)
    this.appendContainer(container)
    return container
  }

  setupMediaControl(container) {
    if (this.mediaControl) {
      this.mediaControl.setContainer(container)
    } else {
      this.mediaControl = this.createMediaControl(_.extend({container: container}, this.options))
      this.listenTo(this.mediaControl, Events.MEDIACONTROL_FULLSCREEN, this.toggleFullscreen)
      this.listenTo(this.mediaControl, Events.MEDIACONTROL_SHOW, this.onMediaControlShow.bind(this, true))
      this.listenTo(this.mediaControl, Events.MEDIACONTROL_HIDE, this.onMediaControlShow.bind(this, false))
    }
  }

  createMediaControl(options) {
    if(options.mediacontrol && options.mediacontrol.external) {
      return new options.mediacontrol.external(options);
    } else {
      return new MediaControl(options);
    }
  }

  getCurrentContainer() {
    return this.containers[0]
  }

  toggleFullscreen() {
    if (!Fullscreen.isFullscreen()) {
      Fullscreen.requestFullscreen(this.el)
      this.$el.addClass('fullscreen')
    } else {
      Fullscreen.cancelFullscreen()
      this.$el.removeClass('fullscreen nocursor')
    }
    this.mediaControl.show()
  }

  showMediaControl(event) {
    this.mediaControl.show(event)
  }

  hideMediaControl(event) {
    this.mediaControl.hide(event)
  }

  onMediaControlShow(showing) {
    if (showing)
      this.$el.removeClass('nocursor')
    else if (Fullscreen.isFullscreen())
      this.$el.addClass('nocursor')
  }

  render() {
    var style = Styler.getStyleFor('core')
    //FIXME
    //this.$el.empty()
    this.$el.append(style)
    this.$el.append(this.mediaControl.render().el)

    this.options.width = this.options.width || this.$el.width()
    this.options.height = this.options.height || this.$el.height()
    PlayerInfo.previousSize = PlayerInfo.currentSize = _.pick(this.options, 'width', 'height')
    this.updateSize()

    return this
  }
}

module.exports = Core
